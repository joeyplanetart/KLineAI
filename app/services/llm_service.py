from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate
from app.core.config import settings

class StrategyLLMService:
    def __init__(self):
        self.llm = ChatOpenAI(
            temperature=0.1,
            api_key=settings.OPENAI_API_KEY,
            model="gpt-4" # Use gpt-4 or gpt-3.5-turbo depending on preference
        )
        
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

    def generate_strategy_code(self, description: str) -> str:
        """
        Generate strategy code from natural language description.
        """
        if not settings.OPENAI_API_KEY:
            return "# Error: OPENAI_API_KEY is not set in environment."
            
        try:
            chain = self.strategy_prompt | self.llm
            response = chain.invoke({"user_description": description})
            return response.content
        except Exception as e:
            return f"# Error generating strategy: {str(e)}"

llm_service = StrategyLLMService()
