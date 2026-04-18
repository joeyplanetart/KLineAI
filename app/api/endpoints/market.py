from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Any, Optional
from app.core.db import get_db
from app.models.stock import StockDaily
from app.services.data_fetcher import fetch_and_save_daily_data
from app.services.data_source_manager import data_source_manager
from pydantic import BaseModel
from datetime import date
import akshare as ak

router = APIRouter()


class StockDailySchema(BaseModel):
    symbol: str
    trade_date: date
    open: float
    close: float
    high: float
    low: float
    volume: int
    amount: float
    pct_change: float

    class Config:
        from_attributes = True


class StockInfo(BaseModel):
    code: str
    name: str
    search_key: str  # 用于显示，如 "银邦股份 (300337.SZ)"


class DataSourceInfo(BaseModel):
    name: str
    id: str
    available: bool
    description: str


class FetchResponse(BaseModel):
    message: str
    source: str
    records_count: int


class DataSourcesResponse(BaseModel):
    sources: List[DataSourceInfo]
    current_source: str


# 缓存股票列表
_stock_list_cache: List[dict] = []


def _get_stock_list() -> List[dict]:
    """获取股票列表（带缓存）"""
    global _stock_list_cache
    if not _stock_list_cache:
        try:
            df = ak.stock_info_a_code_name()
            for _, row in df.iterrows():
                code = row['code']
                name = row['name'].strip()
                # 判断交易所：6开头为上海，0/3开头为深圳
                if code.startswith('6'):
                    search_key = f"{name} ({code}.SH)"
                else:
                    search_key = f"{name} ({code}.SZ)"
                _stock_list_cache.append({
                    "code": code,
                    "name": name,
                    "search_key": search_key
                })
        except Exception as e:
            print(f"Failed to fetch stock list: {e}")
    return _stock_list_cache


@router.get("/sources", response_model=DataSourcesResponse)
def get_data_sources():
    """
    Get available data sources and current status.
    """
    sources = data_source_manager.get_available_sources()
    return DataSourcesResponse(
        sources=sources,
        current_source=data_source_manager.current_source.get_name()
    )


@router.get("/search", response_model=List[StockInfo])
def search_stocks(q: str, limit: int = 10):
    """
    Search stocks by code or name.
    Returns up to `limit` matching stocks.
    """
    if not q or len(q) < 1:
        return []

    q_lower = q.lower()
    stock_list = _get_stock_list()

    # 匹配：代码或名称包含搜索词
    results = []
    for stock in stock_list:
        if q_lower in stock['code'].lower() or q_lower in stock['name'].lower():
            results.append(StockInfo(**stock))
            if len(results) >= limit:
                break

    return results


@router.post("/fetch/{symbol}")
def trigger_data_fetch(
    symbol: str,
    start_date: str,
    end_date: str,
    source: Optional[str] = "auto",
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
) -> FetchResponse:
    """
    Trigger a background task to fetch data for a specific symbol.
    start_date and end_date format: YYYYMMDD

    source: 'auto' (default, try AKShare first, fallback to Tushare),
            'akshare' (force AKShare),
            'tushare' (force Tushare)
    """
    result = fetch_and_save_daily_data(db, symbol, start_date, end_date, source)
    return FetchResponse(
        message=result["message"],
        source=result["source"],
        records_count=result["records_count"]
    )


@router.get("/{symbol}", response_model=List[StockDailySchema])
def get_stock_data(
    symbol: str,
    limit: int = 100,
    db: Session = Depends(get_db)
) -> Any:
    """
    Get daily data for a specific stock symbol.
    """
    data = db.query(StockDaily).filter(StockDaily.symbol == symbol).order_by(
        StockDaily.trade_date.desc()
    ).limit(limit).all()
    if not data:
        raise HTTPException(status_code=404, detail="Data not found")
    return data
