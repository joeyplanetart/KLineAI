from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Any, Optional
from app.core.db import get_db
from app.models.stock import StockDaily
from app.models.data_quality import DataQualityLog
from app.models.stock_info import StockInfo as StockInfoModel, StockStatus
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
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    source: str = "baostock"
    adjust: str = "qfq"  # qfq=前复权, hfq=后复权, 3=不复权


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


def _normalize_symbol(code_or_symbol: str) -> str:
    """将股票代码标准化为 symbol 格式 (sh600000/sz000001)"""
    code_or_symbol = code_or_symbol.strip().lower()
    if code_or_symbol.startswith('sh') or code_or_symbol.startswith('sz'):
        return code_or_symbol
    # 纯代码，根据规则添加前缀
    code = code_or_symbol
    if code.startswith('6') or code.startswith('5'):
        return f'sh{code}'
    else:
        return f'sz{code}'


def _get_stock_list() -> List[dict]:
    """获取股票列表（带缓存，去重）"""
    global _stock_list_cache
    if not _stock_list_cache:
        try:
            df = ak.stock_info_a_code_name()
            seen_codes = set()  # 去重
            for _, row in df.iterrows():
                code = row['code']
                if code in seen_codes:
                    continue
                seen_codes.add(code)
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
    Supports formats: "300337", "sz300337", "sh600000", "银邦"
    """
    if not q or len(q) < 1:
        return []

    q_lower = q.lower()
    stock_list = _get_stock_list()

    # 兼容 sz300337 / sh600000 格式
    exact_symbol = None
    if q_lower.startswith('sz') or q_lower.startswith('sh'):
        exact_symbol = q_lower

    results = []
    for stock in stock_list:
        # 优先精确匹配 symbol（如 sz300337）
        if exact_symbol:
            if stock.get('symbol', '').lower() == exact_symbol:
                results.append(StockInfo(**stock))
        else:
            # 匹配：代码或名称包含搜索词
            if q_lower in stock['code'].lower() or q_lower in stock['name'].lower():
                results.append(StockInfo(**stock))

        if len(results) >= limit:
            break

    return results


def _get_last_trading_day() -> str:
    """获取最近一个交易日（工作日）"""
    from datetime import datetime, timedelta
    today = datetime.now().date()
    # 向前查找最近的交易日（周一到周五）
    for i in range(7):
        check_date = today - timedelta(days=i)
        if check_date.weekday() < 5:  # Monday=0, Friday=4
            return check_date.strftime("%Y%m%d")
    return today.strftime("%Y%m%d")


@router.post("/fetch/{symbol}")
def trigger_data_fetch(
    symbol: str,
    start_date: str = None,
    end_date: str = None,
    source: Optional[str] = "auto",
    adjust: Optional[str] = "qfq",
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
) -> FetchResponse:
    """
    Trigger a background task to fetch data for a specific symbol.

    start_date and end_date format: YYYYMMDD
    If not provided, defaults to the most recent trading day.

    source: 'auto' (default, try BaoStock first, fallback to AKShare),
            'baostock' (force BaoStock),
            'akshare' (force AKShare),
            'tushare' (force Tushare)

    adjust: 'qfq' (前复权, default), 'hfq' (后复权), '3' (不复权)
            注意：仅 BaoStock 和 Tushare 支持此参数
    """
    # 如果没有提供日期，默认获取最近一个交易日
    if not end_date:
        end_date = _get_last_trading_day()
    if not start_date:
        start_date = end_date

    result = fetch_and_save_daily_data(db, symbol, start_date, end_date, source, adjust=adjust)
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
    If symbols is empty, fetches all active A-share stocks from the database.

    Request body:
    - symbols: List of stock symbols (e.g., ["sh600000", "sz000001"]). If empty, fetches all A-share stocks.
    - start_date: Start date in YYYYMMDD format (optional, defaults to most recent trading day)
    - end_date: End date in YYYYMMDD format (optional, defaults to most recent trading day)
    - source: Data source to use (default: baostock)
    - adjust: 'qfq' (前复权), 'hfq' (后复权), '3' (不复权)
    """
    collector = BatchCollector()

    # If symbols is empty, fetch all active A-share stocks from database
    symbols = [_normalize_symbol(s) for s in request.symbols] if request.symbols else []
    is_fetch_all = False
    if not symbols:
        stocks = db.query(StockInfoModel).filter(
            StockInfoModel.status == StockStatus.ACTIVE
        ).all()
        symbols = [s.symbol for s in stocks]
        is_fetch_all = True

    # Limit batch size to prevent overload (only for explicit symbol lists)
    if len(symbols) > 100 and not is_fetch_all:
        raise HTTPException(status_code=400, detail="Batch size exceeds 100 symbols")

    # Default dates to most recent trading day if not provided
    end_date = request.end_date or _get_last_trading_day()
    start_date = request.start_date or end_date

    # If fetching all stocks, process in batches of 100
    total_success = 0
    total_failed = 0
    total_count = len(symbols)

    if is_fetch_all and len(symbols) > 100:
        # Process in batches
        for i in range(0, len(symbols), 100):
            batch_symbols = symbols[i:i + 100]
            result = collector.batch_fetch(
                db,
                batch_symbols,
                start_date,
                end_date,
                request.source,
                adjust=request.adjust
            )
            total_success += result["success"]
            total_failed += result["failed"]

        return BatchFetchResponse(
            message=f"采集全部A股完成: {total_success}/{total_count} 成功",
            total=total_count,
            success=total_success,
            failed=total_failed
        )
    else:
        result = collector.batch_fetch(
            db,
            symbols,
            start_date,
            end_date,
            request.source,
            adjust=request.adjust
        )

        return BatchFetchResponse(
            message=f"Batch fetch completed: {result['success']}/{result['total']} successful",
            total=result["total"],
            success=result["success"],
            failed=result["failed"]
        )


@router.post("/batch-all")
def batch_fetch_all(
    request: BatchFetchRequest,
    db: Session = Depends(get_db)
):
    """
    Start a background batch fetch for all A-share stocks.
    Returns a job_id that can be used to track progress.

    Request body:
    - start_date: Start date in YYYYMMDD format (optional, defaults to most recent trading day)
    - end_date: End date in YYYYMMDD format (optional, defaults to most recent trading day)
    - source: Data source to use (default: baostock)
    - adjust: 'qfq' (前复权), 'hfq' (后复权), '3' (不复权)
    """
    from app.services.batch_job import batch_job_service

    # Get all active A-share stocks from database
    stocks = db.query(StockInfoModel).filter(
        StockInfoModel.status == StockStatus.ACTIVE
    ).all()
    symbols = [s.symbol for s in stocks]

    if not symbols:
        return {
            "job_id": None,
            "status": "skipped",
            "message": "No active stocks found",
            "total": 0
        }

    # Default dates to most recent trading day if not provided
    end_date = request.end_date or _get_last_trading_day()
    start_date = request.start_date or end_date

    # Start background job
    job_id = batch_job_service.start_batch_job(
        db=db,
        symbols=symbols,
        start_date=start_date,
        end_date=end_date,
        source=request.source,
        adjust=request.adjust
    )

    return {
        "job_id": job_id,
        "status": "started",
        "message": f"批量采集任务已启动，共 {len(symbols)} 只股票",
        "total": len(symbols),
        "start_date": start_date,
        "end_date": end_date
    }


@router.get("/batch-all/{job_id}/status")
def get_batch_job_status(job_id: str):
    """
    Get the status of a batch fetch job.
    """
    from app.services.batch_job import batch_job_service

    job_data = batch_job_service.get_job_status(job_id)

    if not job_data:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    # 计算进度百分比
    progress = 0
    if job_data["total"] > 0:
        progress = int(job_data["current"] / job_data["total"] * 100)

    return {
        "job_id": job_id,
        "status": job_data["status"],
        "total": job_data["total"],
        "current": job_data["current"],
        "success": job_data["success"],
        "failed": job_data["failed"],
        "progress": progress,
        "created_at": job_data.get("created_at"),
        "started_at": job_data.get("started_at"),
        "completed_at": job_data.get("completed_at"),
        "error": job_data.get("error")
    }


@router.get("/batch-all/active")
def get_active_batch_jobs():
    """
    Get all active (running or pending) batch jobs.
    This endpoint helps frontend resume progress tracking after page refresh.
    """
    from app.services.batch_job import batch_job_service

    active_jobs = batch_job_service.get_active_jobs()

    return {
        "active_jobs": active_jobs,
        "count": len(active_jobs)
    }


@router.delete("/batch-all/cache")
def clear_batch_job_cache():
    """
    清除所有批量采集任务的缓存（用于重置任务状态）
    """
    from app.services.batch_job import batch_job_service

    cleared_count = batch_job_service.clear_all_jobs()
    return {"message": f"已清除 {cleared_count} 个批量任务缓存", "cleared_count": cleared_count}


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


@router.get("/quality/anomalies")
def get_data_quality_anomalies(
    days: int = 30,
    page: int = 1,
    page_size: int = 50,
    resolved: bool = False,
    anomaly_type: str = None,
    symbol: str = None,
    db: Session = Depends(get_db)
):
    """
    Get paginated data quality anomalies.

    Args:
        days: Number of days to look back
        page: Page number (1-based)
        page_size: Number of records per page (default 50, max 100)
        resolved: If True, include resolved anomalies
        anomaly_type: Filter by anomaly type
        symbol: Filter by stock symbol
    """
    page_size = min(page_size, 100)
    offset = (page - 1) * page_size

    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=days)

    query = db.query(DataQualityLog).filter(
        DataQualityLog.created_at >= start_date
    )

    if not resolved:
        query = query.filter(DataQualityLog.resolved == False)

    if anomaly_type:
        query = query.filter(DataQualityLog.anomaly_type == anomaly_type)

    if symbol:
        query = query.filter(DataQualityLog.symbol == symbol)

    # Get total count
    total = query.count()

    anomalies = query.order_by(
        DataQualityLog.created_at.desc()
    ).offset(offset).limit(page_size).all()

    return {
        "data": anomalies,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size if total > 0 else 0
        }
    }


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
    page: int = 1,
    page_size: int = 50,
    exchange: str = None,
    status: str = None,
    search: str = None,
    db: Session = Depends(get_db)
):
    """
    Get paginated list of stocks from database.

    Args:
        page: Page number (1-based)
        page_size: Number of records per page (default 50, max 100)
        exchange: Filter by exchange (SH, SZ)
        status: Filter by status (active, suspended, delisted)
        search: Search by code or name (partial match)
    """
    # Limit page_size to prevent overload
    page_size = min(page_size, 100)
    offset = (page - 1) * page_size

    query = db.query(StockInfoModel)

    # Apply filters
    if exchange:
        query = query.filter(StockInfoModel.exchange == exchange.upper())

    if status:
        query = query.filter(StockInfoModel.status == status.lower())

    if search:
        search_lower = search.lower()
        # 兼容 sz300337 / sh600000 格式，精确匹配 symbol
        if search_lower.startswith('sz') or search_lower.startswith('sh'):
            query = query.filter(StockInfoModel.symbol == search_lower)
        else:
            search_pattern = f"%{search}%"
            query = query.filter(
                (StockInfoModel.code.ilike(search_pattern)) |
                (StockInfoModel.name.ilike(search_pattern))
            )

    # Get total count before pagination
    total = query.count()

    # Apply pagination
    stocks = query.order_by(StockInfoModel.code.asc()).offset(offset).limit(page_size).all()

    # Get latest trading data for each stock
    symbols = [s.symbol for s in stocks]
    latest_data = {}
    if symbols:
        # Get the latest trade date for each symbol
        latest_dates_subquery = db.query(
            StockDaily.symbol,
            func.max(StockDaily.trade_date).label('latest_date')
        ).filter(
            StockDaily.symbol.in_(symbols)
        ).group_by(StockDaily.symbol).subquery()

        # Join to get full records
        latest_records = db.query(StockDaily).join(
            latest_dates_subquery,
            (StockDaily.symbol == latest_dates_subquery.c.symbol) &
            (StockDaily.trade_date == latest_dates_subquery.c.latest_date)
        ).all()

        for record in latest_records:
            # 计算量比: 当前成交量 / 5日平均成交量
            # 先获取最近5个交易日的成交量
            recent_volumes = db.query(StockDaily.volume).filter(
                StockDaily.symbol == record.symbol,
                StockDaily.trade_date < record.trade_date
            ).order_by(StockDaily.trade_date.desc()).limit(5).all()

            if recent_volumes:
                avg_volume = sum(v[0] for v in recent_volumes) / len(recent_volumes)
                volume_ratio = float(record.volume) / float(avg_volume) if avg_volume > 0 else None
            else:
                volume_ratio = None

            # 计算涨停/跌停状态：需要获取前一天收盘价
            limit_status = 'none'
            prev_close = None
            # 主板10%涨跌幅，创业板/科创板20%
            is_chi_next = record.symbol.startswith('sz300') or record.symbol.startswith('sh688')
            limit_pct = 0.20 if is_chi_next else 0.10

            if len(recent_volumes) > 0:
                # 获取前一天收盘价
                prev_record = db.query(StockDaily.close).filter(
                    StockDaily.symbol == record.symbol,
                    StockDaily.trade_date < record.trade_date
                ).order_by(StockDaily.trade_date.desc()).first()
                if prev_record:
                    prev_close = prev_record.close
                    if prev_close and prev_close > 0:
                        upper_limit = prev_close * (1 + limit_pct)
                        lower_limit = prev_close * (1 - limit_pct)
                        # 使用收盘价判断（考虑浮点数精度）
                        if record.close >= upper_limit * 0.9999:
                            limit_status = 'up'
                        elif record.close <= lower_limit * 1.0001:
                            limit_status = 'down'

            # 计算隔日涨停价/跌停价（基于当前收盘价）
            next_limit_up = round(record.close * (1 + limit_pct), 2) if record.close else None
            next_limit_down = round(record.close * (1 - limit_pct), 2) if record.close else None

            latest_data[record.symbol] = {
                "trade_date": record.trade_date.isoformat() if record.trade_date else None,
                "close": record.close,
                "pct_change": record.pct_change,
                "volume": record.volume,
                "amount": record.amount,
                "turnover_rate": record.turnover_rate,
                "amplitude": record.amplitude,
                "volume_ratio": round(volume_ratio, 2) if volume_ratio else None,
                "limit_status": limit_status,
                "next_limit_up": next_limit_up,
                "next_limit_down": next_limit_down,
            }

    return {
        "data": [
            {
                "symbol": s.symbol,
                "code": s.code,
                "name": s.name,
                "exchange": s.exchange,
                "status": s.status.value if hasattr(s, 'status') and s.status else 'active',
                "listing_date": s.listing_date.isoformat() if s.listing_date else None,
                "industry": s.industry if hasattr(s, 'industry') else None,
                "market_cap": s.market_cap if hasattr(s, 'market_cap') else None,
                "latest": latest_data.get(s.symbol, {})
            }
            for s in stocks
        ],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size if total > 0 else 0
        }
    }


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


@router.post("/fetch-today")
def fetch_today_data(
    source: Optional[str] = "baostock",
    adjust: Optional[str] = "qfq",
    db: Session = Depends(get_db)
):
    """
    Fetch the most recent trading day's data for all stocks in the database.
    This is used for daily market close data updates.

    source: Data source to use (default: baostock)
    adjust: 'qfq' (前复权, default), 'hfq' (后复权), '3' (不复权)
    """
    from datetime import datetime

    trading_day = _get_last_trading_day()

    # Get all active stock symbols from database
    stocks = db.query(StockInfoModel).filter(
        StockInfoModel.status == StockStatus.ACTIVE
    ).all()

    symbols = [s.symbol for s in stocks]
    total = len(symbols)

    if total == 0:
        return {
            "status": "skipped",
            "message": "No active stocks found",
            "trading_day": trading_day,
            "total": 0,
            "success": 0,
            "failed": 0
        }

    # Limit to prevent overload - fetch in background for large batches
    if total > 100:
        return {
            "status": "too_many",
            "message": f"Too many stocks ({total}). Use batch endpoint with smaller batches.",
            "trading_day": trading_day,
            "total": total,
            "suggestion": "Use /api/v1/market/batch with paginated symbols"
        }

    # Batch fetch
    collector = BatchCollector()
    result = collector.batch_fetch(
        db,
        symbols,
        trading_day,
        trading_day,
        source,
        adjust=adjust
    )

    return {
        "status": "completed",
        "trading_day": trading_day,
        "total": result["total"],
        "success": result["success"],
        "failed": result["failed"]
    }


@router.get("/{symbol}")
def get_stock_data(
    symbol: str,
    page: int = 1,
    page_size: int = 100,
    start_date: str = None,
    end_date: str = None,
    db: Session = Depends(get_db)
):
    """
    Get paginated daily data for a specific stock symbol.

    Args:
        symbol: Stock symbol (e.g., sz002402, sh600000)
        page: Page number (1-based)
        page_size: Number of records per page (default 100, max 500)
        start_date: Filter by start date (YYYYMMDD)
        end_date: Filter by end date (YYYYMMDD)
    """
    page_size = min(page_size, 500)
    offset = (page - 1) * page_size

    query = db.query(StockDaily).filter(StockDaily.symbol == symbol)

    # Apply date filters if provided
    if start_date:
        start = datetime.strptime(start_date, "%Y%m%d").date()
        query = query.filter(StockDaily.trade_date >= start)

    if end_date:
        end = datetime.strptime(end_date, "%Y%m%d").date()
        query = query.filter(StockDaily.trade_date <= end)

    # Get total count
    total = query.count()

    data = query.order_by(StockDaily.trade_date.desc()).offset(offset).limit(page_size).all()

    # Return empty result if no data (don't raise 404, just return empty data array)

    return {
        "symbol": symbol,
        "data": [
            {
                "trade_date": d.trade_date.isoformat() if d.trade_date else None,
                "open": d.open,
                "close": d.close,
                "high": d.high,
                "low": d.low,
                "volume": d.volume,
                "amount": d.amount,
                "pct_change": d.pct_change,
                "change_amount": d.change_amount if hasattr(d, 'change_amount') else None,
                "turnover_rate": d.turnover_rate if hasattr(d, 'turnover_rate') else None,
                "amplitude": d.amplitude if hasattr(d, 'amplitude') else None
            }
            for d in data
        ],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size if total > 0 else 0
        }
    }


@router.delete("/data/all")
def clear_all_stock_data(db: Session = Depends(get_db)):
    """
    清空所有股票数据（谨慎使用）
    """
    try:
        deleted = db.query(StockDaily).delete()
        db.commit()
        return {"message": f"已清空 {deleted} 条股票数据", "deleted_count": deleted}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"清空数据失败: {str(e)}")


@router.delete("/data/{symbol}")
def clear_stock_data(symbol: str, db: Session = Depends(get_db)):
    """
    清空指定股票的所有数据
    """
    try:
        deleted = db.query(StockDaily).filter(StockDaily.symbol == symbol).delete()
        db.commit()
        return {"message": f"已清空 {symbol} 的 {deleted} 条数据", "deleted_count": deleted}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"清空数据失败: {str(e)}")
