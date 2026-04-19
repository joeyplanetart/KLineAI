from sqlalchemy import Column, Integer, String, Text, DateTime, Enum as SQLEnum
from datetime import datetime
from app.core.db import Base
import enum


class StrategyStatus(str, enum.Enum):
    DRAFT = "draft"      # 草稿
    ACTIVE = "active"    # 激活/在使用
    ARCHIVED = "archived" # 已归档


class Strategy(Base):
    __tablename__ = "strategies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)                    # 自然语言描述
    strategy_code = Column(Text, nullable=False)  # Python策略代码
    status = Column(SQLEnum(StrategyStatus, values_callable=lambda x: [e.value for e in x]),
                    default=StrategyStatus.DRAFT, nullable=False)
    created_by = Column(Integer, nullable=True)   # 用户ID
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # 回测结果（可选保存）
    last_backtest_result = Column(Text)           # JSON格式保存最后回测结果
    last_backtest_at = Column(DateTime)           # 最后回测时间