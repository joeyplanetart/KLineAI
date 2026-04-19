from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Any, Optional
from app.core.db import get_db
from app.models.stock import StockDaily
from app.models.data_quality import DataQualityLog
from app.models.stock_info import StockInfo as StockInfoModel
from app.services.data_fetcher import fetch_and_save_daily_data
from app.services.data_source_manager import data_source_manager
from app.services.data_collector.batch_collector import BatchCollector
from app.services.data_collector.realtime_collector import RealtimeCollector
from app.services.cache.cache_manager import cache_manager
from pydantic import BaseModel
from datetime import date, datetime, timedelta
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


class BatchFetchRequest(BaseModel):
    symbols: List[str]
    start_date: str
    end_date: str
    source: str = "baostock"


class BatchFetchResponse(BaseModel):
    message: str
    total: int
    success: int
    failed: int


class DataSourcesResponse(BaseModel):
    sources: List[DataSourceInfo]
    current_source: str


class RealtimeQuote(BaseModel):
    symbol: str
    name: str
    price: float
    change: float
    pct_change: float
    volume: int
    amount: float
    high: float
    low: float
    open: float
    prev_close: float
    timestamp: str


class DataQualitySummary(BaseModel):
    period_days: int
    anomalies_by_type: dict
    total_unresolved: int


class AnomalyRecord(BaseModel):
    id: int
    symbol: str
    trade_date: date
    anomaly_type: str
    field_name: str
    actual_value: str
    expected_value: str
    message: str
    created_at: datetime
    resolved: bool

    class Config:
        from_attributes = True


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

    source: 'auto' (default, try BaoStock first, fallback to AKShare),
            'baostock' (force BaoStock),
            'akshare' (force AKShare),
            'tushare' (force Tushare)
    """
    result = fetch_and_save_daily_data(db, symbol, start_date, end_date, source)
    return FetchResponse(
        message=result["message"],
        source=result["source"],
        records_count=result["records_count"]
    )


@router.post("/batch", response_model=BatchFetchResponse)
def batch_fetch_stocks(
    request: BatchFetchRequest,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
) -> BatchFetchResponse:
    """
    Batch fetch data for multiple symbols.

    Request body:
    - symbols: List of stock symbols (e.g., ["sh600000", "sz000001"])
    - start_date: Start date in YYYYMMDD format
    - end_date: End date in YYYYMMDD format
    - source: Data source to use (default: baostock)
    """
    collector = BatchCollector()

    # Limit batch size to prevent overload
    if len(request.symbols) > 100:
        raise HTTPException(status_code=400, detail="Batch size exceeds 100 symbols")

    result = collector.batch_fetch(
        db,
        request.symbols,
        request.start_date,
        request.end_date,
        request.source
    )

    return BatchFetchResponse(
        message=f"Batch fetch completed: {result['success']}/{result['total']} successful",
        total=result["total"],
        success=result["success"],
        failed=result["failed"]
    )


@router.get("/realtime/{symbol}", response_model=RealtimeQuote)
def get_realtime_quote(
    symbol: str,
    db: Session = Depends(get_db)
) -> RealtimeQuote:
    """
    Get real-time quote for a stock symbol.
    Returns cached data if available, otherwise fetches fresh data.
    """
    collector = RealtimeCollector(poll_interval=0)

    # Try to get from cache first
    cached = collector.get_cached_quote(symbol)
    if cached:
        return RealtimeQuote(**cached)

    # Fetch fresh
    quote = collector.fetch_realtime_quote(symbol)
    if not quote:
        raise HTTPException(status_code=404, detail=f"Failed to fetch quote for {symbol}")

    return RealtimeQuote(**quote)


@router.get("/quality", response_model=DataQualitySummary)
def get_data_quality_summary(days: int = 30, db: Session = Depends(get_db)) -> DataQualitySummary:
    """
    Get data quality summary for the past N days.

    Returns anomaly counts grouped by type.
    """
    # Try cache first
    cached = cache_manager.get(f"data:quality:summary:{days}")
    if cached:
        return DataQualitySummary(**cached)

    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=days)

    # Query anomaly counts
    from sqlalchemy import func

    results = db.query(
        DataQualityLog.anomaly_type,
        func.count(DataQualityLog.id).label("count")
    ).filter(
        DataQualityLog.created_at >= start_date,
        DataQualityLog.resolved == False
    ).group_by(
        DataQualityLog.anomaly_type
    ).all()

    summary = DataQualitySummary(
        period_days=days,
        anomalies_by_type={str(r[0]): r[1] for r in results},
        total_unresolved=sum(r[1] for r in results)
    )

    # Cache the result
    cache_manager.set(f"data:quality:summary:{days}", summary.model_dump(), ttl=1800)

    return summary


@router.get("/quality/anomalies", response_model=List[AnomalyRecord])
def get_data_quality_anomalies(
    days: int = 30,
    limit: int = 100,
    resolved: bool = False,
    db: Session = Depends(get_db)
) -> List[AnomalyRecord]:
    """
    Get recent data quality anomalies.

    Args:
        days: Number of days to look back
        limit: Maximum number of records to return
        resolved: If True, include resolved anomalies
    """
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=days)

    query = db.query(DataQualityLog).filter(
        DataQualityLog.created_at >= start_date
    )

    if not resolved:
        query = query.filter(DataQualityLog.resolved == False)

    anomalies = query.order_by(
        DataQualityLog.created_at.desc()
    ).limit(limit).all()

    return anomalies


@router.post("/quality/anomalies/{anomaly_id}/resolve")
def resolve_anomaly(
    anomaly_id: int,
    notes: str = None,
    db: Session = Depends(get_db)
):
    """
    Mark a data quality anomaly as resolved.
    """
    log = db.query(DataQualityLog).filter(DataQualityLog.id == anomaly_id).first()

    if not log:
        raise HTTPException(status_code=404, detail=f"Anomaly {anomaly_id} not found")

    log.resolved = True
    log.resolved_at = datetime.utcnow()
    if notes:
        log.resolution_notes = notes

    db.commit()

    return {
        "status": "resolved",
        "anomaly_id": anomaly_id,
        "resolved_at": log.resolved_at.isoformat()
    }


@router.get("/list")
def get_stock_list(
    exchange: str = None,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    Get list of stocks from database.

    Args:
        exchange: Filter by exchange (SH, SZ)
        limit: Maximum number of records
    """
    query = db.query(StockInfoModel)

    if exchange:
        query = query.filter(StockInfoModel.exchange == exchange)

    stocks = query.limit(limit).all()

    return [
        {
            "symbol": s.symbol,
            "code": s.code,
            "name": s.name,
            "exchange": s.exchange,
            "status": s.status if hasattr(s, 'status') and s.status else 'active',
            "listing_date": s.listing_date.isoformat() if s.listing_date else None
        }
        for s in stocks
    ]


@router.post("/sync")
def sync_stock_list(
    db: Session = Depends(get_db)
):
    """
    Sync stock list from data source to database.
    This fetches the latest list of stocks from BaoStock/AKShare.
    """
    collector = BatchCollector()
    result = collector.sync_stock_list(db)

    if result["success"]:
        return {
            "status": "success",
            "message": result["message"],
            "added": result.get("added", 0),
            "updated": result.get("updated", 0)
        }

    return {
        "status": "failed",
        "message": result.get("message", "Unknown error")
    }


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
