from sqlalchemy import Column, Integer, String, Float, Date, Boolean, Enum as SQLEnum
from datetime import datetime
from app.core.db import Base
import enum


class StockStatus(str, enum.Enum):
    ACTIVE = "active"      # 上市
    SUSPENDED = "suspended"  # 暂停上市
    DELISTED = "delisted"   # 退市


class StockInfo(Base):
    __tablename__ = "stock_info"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(10), unique=True, index=True, nullable=False)  # e.g. sh600000
    code = Column(String(6), index=True, nullable=False)  # e.g. 600000
    name = Column(String(50), nullable=False)
    exchange = Column(String(10), nullable=False)  # SH, SZ

    status = Column(SQLEnum(StockStatus, values_callable=lambda x: [e.value for e in x]),
                    default=StockStatus.ACTIVE, nullable=False)
    listing_date = Column(Date, nullable=True)
    delist_date = Column(Date, nullable=True)

    # 基本面信息
    industry = Column(String(50), nullable=True)
    market_cap = Column(Float, nullable=True)  # 总市值
    float_cap = Column(Float, nullable=True)   # 流通市值

    # 同步状态
    last_sync_date = Column(Date, nullable=True)
    is_full_loaded = Column(Boolean, default=False)  # 历史数据是否加载完整
    created_at = Column(Date, default=datetime.utcnow, nullable=False)
    updated_at = Column(Date, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
