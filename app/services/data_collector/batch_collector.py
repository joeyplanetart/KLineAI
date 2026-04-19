import time
import asyncio
from typing import List, Dict, Optional, Callable
from datetime import datetime, date
from sqlalchemy.orm import Session

from app.core.config import settings
from app.services.data_fetcher import fetch_and_save_daily_data
from app.services.cache.cache_manager import cache_manager, CacheKey
from app.models.stock_info import StockInfo, StockStatus


class BatchCollector:
    """
    Batch collector for fetching data for multiple stocks.
    Supports rate limiting, distributed locking, and retry mechanism.
    """

    def __init__(
        self,
        batch_size: int = None,
        rate_limit_delay: float = None,
        max_retries: int = None
    ):
        self.batch_size = batch_size or settings.BATCH_SIZE
        self.rate_limit_delay = rate_limit_delay or settings.RATE_LIMIT_DELAY
        self.max_retries = max_retries or settings.MAX_RETRIES
        self.cache = cache_manager

    def collect_stock_list(self, db: Session) -> List[str]:
        """
        Get list of all active stock symbols from database.
        Returns list of symbols like ['sh600000', 'sz000001', ...]
        """
        stocks = db.query(StockInfo).filter(
            StockInfo.status == StockStatus.ACTIVE
        ).all()

        symbols = [stock.symbol for stock in stocks]
        return symbols

    def collect_market_all(self, db: Session) -> List[Dict]:
        """
        Get full market stock list from data source.
        Returns list of stock info dicts.
        """
        from app.services.data_source_manager import data_source_manager

        try:
            stocks = data_source_manager.fetch_stock_list()
            return stocks
        except Exception as e:
            print(f"Error fetching market stock list: {e}")
            return []

    def batch_fetch(
        self,
        db: Session,
        symbols: List[str],
        start_date: str,
        end_date: str,
        source: str = "baostock",
        progress_callback: Optional[Callable] = None
    ) -> Dict[str, dict]:
        """
        Batch fetch data for multiple stocks.

        Args:
            db: Database session
            symbols: List of stock symbols
            start_date: Start date in YYYYMMDD format
            end_date: End date in YYYYMMDD format
            source: Data source to use
            progress_callback: Optional callback(symbol, result) for progress reporting

        Returns:
            Dict mapping symbol to result dict
        """
        results = {}
        total = len(symbols)
        success_count = 0
        fail_count = 0

        for i, symbol in enumerate(symbols):
            # Try to acquire distributed lock to prevent duplicate fetching
            lock = None
            try:
                lock = self.cache.acquire_fetch_lock(symbol, timeout=60)
            except Exception as e:
                print(f"Warning: Could not acquire lock for {symbol}, proceeding without lock: {e}")

            try:
                # Fetch data with retry
                last_result = None
                for attempt in range(self.max_retries):
                    result = fetch_and_save_daily_data(
                        db, symbol, start_date, end_date, source, validate=True
                    )
                    last_result = result
                    if result["success"]:
                        results[symbol] = result
                        success_count += 1
                        break
                    elif attempt < self.max_retries - 1:
                        time.sleep(self.rate_limit_delay * (attempt + 1))  # Exponential backoff
                else:
                    # All retries exhausted, use the last result message
                    fail_msg = last_result.get("message", f"Failed after {self.max_retries} attempts")
                    print(f"Failed to fetch {symbol}: {fail_msg}")
                    results[symbol] = {
                        "success": False,
                        "message": fail_msg,
                        "records_count": 0
                    }
                    fail_count += 1

            finally:
                if lock:
                    try:
                        self.cache.release_lock(lock)
                    except Exception as e:
                        print(f"Warning: Could not release lock for {symbol}: {e}")

            # Rate limiting
            time.sleep(self.rate_limit_delay)

            # Progress reporting
            if progress_callback and (i + 1) % 10 == 0:
                progress_callback(symbol, results[symbol])

            print(f"Progress: {i + 1}/{total} - {symbol}: {results[symbol].get('message', 'unknown')}")

        return {
            "total": total,
            "success": success_count,
            "failed": fail_count,
            "results": results
        }

    def incremental_update(
        self,
        db: Session,
        symbols: List[str] = None,
        days: int = 5
    ) -> Dict[str, dict]:
        """
        Incrementally update data for stocks.
        Fetches data for the last N trading days.

        Args:
            db: Database session
            symbols: List of symbols to update, or None for all active stocks
            days: Number of days to fetch

        Returns:
            Summary of update results
        """
        if symbols is None:
            symbols = self.collect_stock_list(db)

        # Calculate date range
        end_date = datetime.now().strftime("%Y%m%d")
        start_date = (datetime.now().replace(day=1)).strftime("%Y%m%d")  # First day of month

        # For simplicity, just fetch last 30 days
        from datetime import timedelta
        start_date = (datetime.now() - timedelta(days=days)).strftime("%Y%m%d")

        return self.batch_fetch(db, symbols, start_date, end_date)

    def sync_stock_list(self, db: Session) -> Dict[str, any]:
        """
        Sync stock list from data source to database.
        Updates StockInfo table with latest listings.

        Returns:
            Summary of sync results
        """
        stocks = self.collect_market_all(db)

        if not stocks:
            return {"success": False, "message": "No stocks fetched", "count": 0}

        added = 0
        updated = 0

        for stock_data in stocks:
            symbol = stock_data.get("symbol")
            code = stock_data.get("code")
            name = stock_data.get("name")
            exchange = stock_data.get("exchange", "SH" if code.startswith("6") else "SZ")

            existing = db.query(StockInfo).filter(StockInfo.symbol == symbol).first()

            if existing:
                # Update existing
                existing.name = name
                existing.exchange = exchange
                existing.updated_at = datetime.utcnow()
                updated += 1
            else:
                # Add new
                new_stock = StockInfo(
                    symbol=symbol,
                    code=code,
                    name=name,
                    exchange=exchange,
                    status=StockStatus.ACTIVE
                )
                db.add(new_stock)
                added += 1

        db.commit()

        return {
            "success": True,
            "message": f"Synced {len(stocks)} stocks",
            "added": added,
            "updated": updated
        }
