from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Any, Optional
from app.core.db import get_db
from app.models.stock import StockDaily
from app.services.data_fetcher import fetch_and_save_daily_data
from app.services.data_source_manager import data_source_manager
from pydantic import BaseModel
from datetime import date

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
