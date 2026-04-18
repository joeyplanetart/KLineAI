from sqlalchemy import Column, Integer, String, Float, Date, BigInteger, UniqueConstraint
from app.core.db import Base

class StockDaily(Base):
    __tablename__ = "stock_daily"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(10), index=True, nullable=False) # e.g. sh600000
    name = Column(String(50))
    trade_date = Column(Date, index=True, nullable=False)
    
    open = Column(Float)
    close = Column(Float)
    high = Column(Float)
    low = Column(Float)
    
    volume = Column(BigInteger)     # 成交量
    amount = Column(Float)          # 成交额
    
    change_amount = Column(Float)   # 涨跌额
    pct_change = Column(Float)      # 涨跌幅
    turnover_rate = Column(Float)   # 换手率
    amplitude = Column(Float)       # 振幅
    pe = Column(Float)              # 市盈率
    pb = Column(Float)              # 市净率

    __table_args__ = (
        UniqueConstraint('symbol', 'trade_date', name='uq_stock_daily_symbol_date'),
    )
