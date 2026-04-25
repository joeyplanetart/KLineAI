"""Strategy code generation service. Delegates to multi-provider LLM adapter."""
import time
import logging

from app.core.config import settings
from app.services.llm import LLMService

logger = logging.getLogger(__name__)

STRATEGY_SYSTEM_PROMPT = """\
You are an expert quantitative trading developer using Python, pandas, and Backtrader.
The user wants to create a trading strategy based on a natural language description.

Requirements:
1. Define a class that inherits from backtrader.Strategy.
2. Initialize indicators in the __init__ method.
3. Implement the trading logic in the next() method.
4. Output ONLY raw Python code. No markdown fences, no explanations.
"""


class StrategyLLMService:
    """Generates Backtrader strategy code from natural language via multi-provider LLM."""

    def __init__(self):
        self.provider = LLMService()
        self._model_name = None

    @property
    def model_name(self) -> str:
        """Resolve the effective model name for strategy generation."""
        if not self._model_name:
            self._model_name = self.provider.get_code_generation_model()
        return self._model_name

    def generate_strategy_code(self, description: str, user_id: int = None) -> dict:
        """
        Generate strategy code from natural language description.
        Returns dict with 'code' and 'usage' information.
        """
        has_key = any([
            settings.MINIMAX_API_KEY, settings.OPENAI_API_KEY,
            settings.DEEPSEEK_API_KEY, settings.GOOGLE_API_KEY,
            settings.OPENROUTER_API_KEY, settings.GROK_API_KEY,
            settings.CUSTOM_API_KEY,
        ])
        if not has_key:
            return {
                "code": "# Error: No LLM API key configured. Please set at least one provider API key in .env",
                "usage": None,
            }

        try:
            start_time = time.time()
            user_prompt = f'User description: "{description}"\n\nGenerate the complete Backtrader strategy code:'

            code = self.provider.call_llm_api(
                messages=[
                    {"role": "system", "content": STRATEGY_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                model=self.model_name,
                temperature=0.1,
                use_json_mode=False,
            )

            # Strip markdown fences if present
            code = code.strip()
            if code.startswith("```"):
                first_newline = code.find("\n")
                if first_newline != -1:
                    code = code[first_newline + 1:]
                if code.endswith("```"):
                    code = code[:-3]
            code = code.strip()

            latency_ms = int((time.time() - start_time) * 1000)
            total_tokens = len(description) + len(code)
            usage_info = {
                "model": self.model_name,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": total_tokens,
                "cost": self._calculate_cost(total_tokens),
                "latency_ms": latency_ms,
                "api_response": "",
            }

            self._save_usage(user_id, usage_info)
            return {"code": code, "usage": usage_info}
        except Exception as e:
            logger.error(f"Strategy generation failed: {e}")
            return {
                "code": f"# Error generating strategy: {str(e)}",
                "usage": None,
            }

    def _calculate_cost(self, tokens: int) -> float:
        if self.model_name and "MiniMax" in self.model_name:
            return tokens * 0.0001
        return tokens * 0.00003

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
                    api_response=usage_info["api_response"],
                )
                db.add(usage_record)
                db.commit()
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Failed to save usage: {e}")


llm_service = StrategyLLMService()
