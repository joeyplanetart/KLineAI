from sqlalchemy import Column, Integer, String, Float, DateTime, BigInteger, Text
from datetime import datetime
from app.core.db import Base


class ModelUsage(Base):
    __tablename__ = "model_usage"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    model = Column(String(50), nullable=False, index=True)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    cost = Column(Float, default=0.0)
    latency_ms = Column(Integer, default=0)
    api_response = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
