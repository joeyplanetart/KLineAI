from sqlalchemy import Column, Integer, String, DateTime, JSON, Enum as SQLEnum, Boolean, Date
from datetime import datetime
from app.core.db import Base
import enum


class AnomalyType(str, enum.Enum):
    NEGATIVE_PRICE = "negative_price"          # 负价格
    EXCESSIVE_CHANGE = "excessive_change"      # 涨跌幅过大
    INVALID_OHLC = "invalid_ohlc"            # OHLC不一致 (open > high, low > close等)
    ZERO_VOLUME = "zero_volume"               # 零成交量
    MISSING_FIELD = "missing_field"           # 缺失字段
    OUTLIER = "outlier"                       # 统计异常值
    EXCESSIVE_AMPLITUDE = "excessive_amplitude"  # 振幅过大


class DataQualityLog(Base):
    __tablename__ = "data_quality_log"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(10), index=True, nullable=False)
    trade_date = Column(Date, index=True, nullable=False)
    anomaly_type = Column(SQLEnum(AnomalyType, values_callable=lambda x: [e.value for e in x]),
                          nullable=False)

    field_name = Column(String(50), nullable=True)  # 问题字段
    actual_value = Column(String(100), nullable=True)  # 实际值
    expected_value = Column(String(100), nullable=True)  # 期望值

    details = Column(JSON, nullable=True)  # 额外上下文信息

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    resolved = Column(Boolean, default=False)
    resolved_at = Column(DateTime, nullable=True)
    resolution_notes = Column(String(500), nullable=True)
