from pydantic_settings import BaseSettings
from datetime import timedelta
import os
from dotenv import load_dotenv

# Load .env file explicitly
load_dotenv()

class Settings(BaseSettings):
    PROJECT_NAME: str = "KLineAI Quantitative Trading System"
    API_V1_STR: str = "/api/v1"

    POSTGRES_SERVER: str = "localhost"
    POSTGRES_USER: str = "klineai_user"
    POSTGRES_PASSWORD: str = "klineai_password"
    POSTGRES_DB: str = "klineai"
    POSTGRES_PORT: str = "5432"

    REDIS_URL: str = "redis://localhost:6379/0"

    # LLM multi-provider configuration
    LLM_PROVIDER: str = ""  # openrouter|openai|google|deepseek|grok|custom|minimax
    OPENAI_API_KEY: str = ""
    MINIMAX_API_KEY: str = ""
    MINIMAX_BASE_URL: str = "https://api.minimax.chat/v1"
    OPENROUTER_API_KEY: str = ""
    GOOGLE_API_KEY: str = ""
    DEEPSEEK_API_KEY: str = ""
    GROK_API_KEY: str = ""
    CUSTOM_API_KEY: str = ""
    CUSTOM_API_URL: str = ""
    CUSTOM_MODEL: str = ""
    AI_CODE_GEN_MODEL: str = ""
    ENABLE_AI_ENSEMBLE: str = "false"
    ENABLE_CONFIDENCE_CALIBRATION: str = "false"
    DEFAULT_ANALYSIS_MARKET: str = "CNStock"

    TUSHARE_TOKEN: str = ""  # 可选，Tushare API Token

    # Redis TTL 配置
    REDIS_CACHE_TTL_REALTIME: int = 30
    REDIS_CACHE_TTL_DAILY: int = 300
    REDIS_CACHE_TTL_STOCK_LIST: int = 3600

    # 批量采集配置
    BATCH_SIZE: int = 100
    RATE_LIMIT_DELAY: float = 0.1
    MAX_RETRIES: int = 3

    # 数据校验阈值
    MAX_PCT_CHANGE: float = 20.0
    MAX_AMPLITUDE: float = 25.0
    MIN_PRICE: float = 0.01

    # JWT 配置
    SECRET_KEY: str = "klineai-super-secret-key-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    class Config:
        case_sensitive = True

settings = Settings()
