from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Enum as SQLEnum, JSON
from app.core.db import Base
import enum
import uuid
from datetime import datetime

class AnalysisStatus(enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class AnalysisReport(Base):
    __tablename__ = "analysis_reports"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(10), index=True, nullable=False)
    name = Column(String(50))
    job_id = Column(String(36), unique=True, default=lambda: str(uuid.uuid4()))

    status = Column(SQLEnum(AnalysisStatus), default=AnalysisStatus.PENDING)

    # 核心结论
    recommendation = Column(String(10))  # HOLD/BUY/SELL
    confidence = Column(Float)  # 0-100

    # 四维评分
    composite_score = Column(Integer)  # 0-100
    technical_score = Column(Integer)  # 0-100
    fundamental_score = Column(Integer)  # 0-100
    sentiment_score = Column(Integer)  # 0-100

    # 周期预测
    cycle_predictions = Column(JSON)

    # 详细数据
    technical_details = Column(JSON)
    fundamental_details = Column(JSON)
    sentiment_details = Column(JSON)

    # 支撑阻力
    support_level = Column(Float)
    resistance_level = Column(Float)

    # 风险提示
    risk_warnings = Column(JSON)

    # AI 生成的完整文本报告
    report = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
