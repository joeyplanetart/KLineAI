import requests
from langchain_core.prompts import PromptTemplate
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import BaseMessage
from app.core.config import settings
import time
from typing import List, Any, Optional


class MiniMaxChatModel(BaseChatModel):
    """Custom chat model for MiniMax Token Plan API (Anthropic-compatible)"""

    model: str = "MiniMax-M2.7"
    temperature: float = 0.1
    max_tokens: int = 4096

    def _llm_type(self) -> str:
        return "minimax"

    def _generate(self, messages: List[BaseMessage], stop: Optional[List[str]] = None, **kwargs) -> Any:
        # Convert messages to MiniMax format
        miniMax_messages = []
        for msg in messages:
            role = "user" if isinstance(msg, BaseMessage) and msg.type == "human" else "user"
            if hasattr(msg, 'type'):
                if msg.type == "ai":
                    role = "assistant"
                elif msg.type == "human":
                    role = "user"
                elif msg.type == "system":
                    role = "system"
            miniMax_messages.append({
                "role": role,
                "content": msg.content if hasattr(msg, 'content') else str(msg)
            })

        url = f"{settings.MINIMAX_BASE_URL}/messages"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.MINIMAX_API_KEY}",
            "anthropic-version": "2023-06-01"
        }
        payload = {
            "model": self.model,
            "messages": miniMax_messages,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature
        }

        response = requests.post(url, headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        data = response.json()

        # Extract content - handle thinking blocks
        content = ""
        if "content" in data:
            for block in data["content"]:
                if block.get("type") == "text":
                    content += block.get("text", "")
        elif "message" in data:
            content = data["message"].get("content", "")

        from langchain_core.outputs import ChatGeneration, ChatResult
        from langchain_core.messages import AIMessage

        ai_message = AIMessage(content=content)
        generation = ChatGeneration(message=ai_message)
        return ChatResult(generations=[generation])


class StrategyLLMService:
    def __init__(self):
        if settings.MINIMAX_API_KEY:
            self.llm = MiniMaxChatModel(
                model="MiniMax-M2.7",
                temperature=0.1
            )
            self.model_name = "MiniMax-M2.7"
        elif settings.OPENAI_API_KEY:
            from langchain_openai import ChatOpenAI
            self.llm = ChatOpenAI(
                temperature=0.1,
                api_key=settings.OPENAI_API_KEY,
                model="gpt-4"
            )
            self.model_name = "gpt-4"
        else:
            self.llm = None
            self.model_name = None

        self.strategy_prompt = PromptTemplate(
            input_variables=["user_description"],
            template="""
You are an expert quantitative trading developer using Python, pandas, and Backtrader.
The user wants to create a trading strategy based on the following natural language description:

"{user_description}"

Generate the complete Python code for this strategy. The code should:
1. Define a class that inherits from backtrader.Strategy.
2. Initialize indicators in the __init__ method.
3. Implement the trading logic in the next() method.
4. ONLY return valid Python code. Do not include markdown formatting like ```python, just the raw code. Do not include explanations.
            """
        )

    def generate_strategy_code(self, description: str, user_id: int = None) -> dict:
        """
        Generate strategy code from natural language description.
        Returns dict with 'code' and 'usage' information.
        """
        if not settings.OPENAI_API_KEY and not settings.MINIMAX_API_KEY:
            return {
                "code": "# Error: No API key configured. Please set OPENAI_API_KEY or MINIMAX_API_KEY in .env",
                "usage": None
            }

        if not self.llm:
            return {
                "code": "# Error: LLM service not initialized",
                "usage": None
            }

        try:
            start_time = time.time()

            chain = self.strategy_prompt | self.llm
            response = chain.invoke({"user_description": description})

            latency_ms = int((time.time() - start_time) * 1000)

            usage_info = {
                "model": self.model_name,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
                "cost": 0.0,
                "latency_ms": latency_ms,
                "api_response": ""
            }

            content = response.content if hasattr(response, 'content') else str(response)

            # Estimate tokens based on content length
            if content:
                usage_info["total_tokens"] = len(description) + len(content)
                usage_info["cost"] = self._calculate_cost(usage_info["total_tokens"])

            self._save_usage(user_id, usage_info)

            return {
                "code": content,
                "usage": usage_info
            }
        except Exception as e:
            return {
                "code": f"# Error generating strategy: {str(e)}",
                "usage": None
            }

    def _calculate_cost(self, tokens: int) -> float:
        if self.model_name == "MiniMax-M2.7":
            return tokens * 0.0001
        elif self.model_name == "gpt-4":
            return tokens * 0.00003
        return 0.0

    def _save_usage(self, user_id: int, usage_info: dict):
        try:
            from app.core.db import SessionLocal
            from app.models.model_usage import ModelUsage

            db = SessionLocal()
            try:
                usage_record = ModelUsage(
                    user_id=user_id,
                    model=usage_info["model"],
                    prompt_tokens=usage_info["prompt_tokens"],
                    completion_tokens=usage_info["completion_tokens"],
                    total_tokens=usage_info["total_tokens"],
                    cost=usage_info["cost"],
                    latency_ms=usage_info["latency_ms"],
                    api_response=usage_info["api_response"]
                )
                db.add(usage_record)
                db.commit()
            finally:
                db.close()
        except Exception as e:
            print(f"Failed to save usage: {e}")


llm_service = StrategyLLMService()
