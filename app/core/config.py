from pydantic_settings import BaseSettings
from datetime import timedelta

class Settings(BaseSettings):
    PROJECT_NAME: str = "KLineAI Quantitative Trading System"
    API_V1_STR: str = "/api/v1"

    POSTGRES_SERVER: str = "localhost"
    POSTGRES_USER: str = "klineai_user"
    POSTGRES_PASSWORD: str = "klineai_password"
    POSTGRES_DB: str = "klineai"
    POSTGRES_PORT: str = "5432"

    REDIS_URL: str = "redis://localhost:6379/0"

    OPENAI_API_KEY: str = ""

    TUSHARE_TOKEN: str = ""  # 可选，Tushare API Token

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
