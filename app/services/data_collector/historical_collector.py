import time
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timedelta, date
from sqlalchemy.orm import Session

from app.core.config import settings
from app.services.cache.cache_manager import cache_manager
from app.services.data_fetcher import fetch_and_save_daily_data
from app.models.stock_info import StockInfo, StockStatus


class HistoricalCollector:
    """
    Historical data collector for backfilling and historical data retrieval.
    Supports progress tracking and resume from last position.
    """

    def __init__(
        self,
        batch_size: int = None,
        max_retries: int = None
    ):
        self.batch_size = batch_size or settings.BATCH_SIZE
        self.max_retries = max_retries or settings.MAX_RETRIES
        self.cache = cache_manager

    def backfill_symbol(
        self,
        db: Session,
        symbol: str,
        start_date: str,
        end_date: str,
        source: str = "baostock",
        validate: bool = True
    ) -> Dict:
        """
        Backfill historical data for a single symbol.

        Args:
            db: Database session
            symbol: Stock symbol
            start_date: Start date in YYYYMMDD format
            end_date: End date in YYYYMMDD format
            source: Data source
            validate: Whether to validate data

        Returns:
            Result dict with success status and record count
        """
        result = fetch_and_save_daily_data(
            db, symbol, start_date, end_date, source, validate
        )
        return result

    def backfill_batch(
        self,
        db: Session,
        symbols: List[str],
        start_date: str,
        end_date: str,
        source: str = "baostock",
        progress_callback: Optional[callable] = None
    ) -> Dict:
        """
        Backfill historical data for multiple symbols.

        Args:
            db: Database session
            symbols: List of stock symbols
            start_date: Start date in YYYYMMDD format
            end_date: End date in YYYYMMDD format
            source: Data source
            progress_callback: Callback function(symbol, result)

        Returns:
            Summary dict with total, success, failed counts
        """
        total = len(symbols)
        success = 0
        failed = 0
        results = {}

        for i, symbol in enumerate(symbols):
            result = self.backfill_symbol(
                db, symbol, start_date, end_date, source
            )
            results[symbol] = result

            if result.get("success"):
                success += 1
            else:
                failed += 1

            # Progress callback
            if progress_callback:
                progress_callback(symbol, result, i + 1, total)

            # Rate limiting
            time.sleep(settings.RATE_LIMIT_DELAY)

        return {
            "total": total,
            "success": success,
            "failed": failed,
            "results": results
        }

    def full_market_backfill(
        self,
        db: Session,
        start_date: str = "19900101",
        end_date: str = None,
        source: str = "baostock"
    ) -> Dict:
        """
        Backfill historical data for entire market.
        This is a long-running operation for initial data load.

        Args:
            db: Database session
            start_date: Start date (default 19900101 for full history)
            end_date: End date (default today)
            source: Data source

        Returns:
            Summary dict
        """
        if end_date is None:
            end_date = datetime.now().strftime("%Y%m%d")

        # Get all active stocks
        stocks = db.query(StockInfo).filter(
            StockStatus.ACTIVE
        ).all()

        symbols = [s.symbol for s in stocks]
        print(f"Starting full market backfill for {len(symbols)} stocks")

        return self.backfill_batch(
            db, symbols, start_date, end_date, source
        )

    def incremental_backfill(
        self,
        db: Session,
        days: int = 30,
        source: str = "baostock"
    ) -> Dict:
        """
        Incrementally backfill recent data.
        Useful for catching up on missed data.

        Args:
            db: Database session
            days: Number of days to backfill
            source: Data source

        Returns:
            Summary dict
        """
        end_date = datetime.now().strftime("%Y%m%d")
        start_date = (datetime.now() - timedelta(days=days)).strftime("%Y%m%d")

        # Get all active stocks
        stocks = db.query(StockInfo).filter(
            StockStatus.ACTIVE
        ).all()

        symbols = [s.symbol for s in stocks]

        return self.backfill_batch(
            db, symbols, start_date, end_date, source
        )

    def get_missing_dates(
        self,
        db: Session,
        symbol: str,
        start_date: str,
        end_date: str
    ) -> List[str]:
        """
        Find missing trading dates for a symbol.
        Returns list of date strings (YYYYMMDD) that have no data.
        """
        from app.models.stock import StockDaily

        # Parse dates
        start = datetime.strptime(start_date, "%Y%m%d").date()
        end = datetime.strptime(end_date, "%Y%m%d").date()

        # Get existing dates
        existing = db.query(StockDaily.trade_date).filter(
            StockDaily.symbol == symbol,
            StockDaily.trade_date >= start,
            StockDaily.trade_date <= end
        ).all()

        existing_dates = {r[0] for r in existing}

        # Find missing dates
        missing = []
        current = start
        while current <= end:
            if current not in existing_dates:
                missing.append(current.strftime("%Y%m%d"))
            current += timedelta(days=1)

        return missing

    def resume_backfill(
        self,
        db: Session,
        symbols: List[str],
        start_date: str,
        end_date: str,
        source: str = "baostock"
    ) -> Dict:
        """
        Resume a backfill operation, only fetching missing dates.
        More efficient than full backfill for catching up.

        Args:
            db: Database session
            symbols: List of stock symbols
            start_date: Start date
            end_date: End date
            source: Data source

        Returns:
            Summary dict
        """
        all_missing = {}

        print("Finding missing dates...")
        for symbol in symbols:
            missing = self.get_missing_dates(db, symbol, start_date, end_date)
            if missing:
                all_missing[symbol] = missing

        print(f"Found {sum(len(v) for v in all_missing.values())} missing records across {len(all_missing)} symbols")

        if not all_missing:
            return {
                "total": len(symbols),
                "success": len(symbols),
                "failed": 0,
                "message": "No missing dates found"
            }

        # Batch fetch missing dates
        results = {}
        for symbol, dates in all_missing.items():
            if not dates:
                continue

            # Fetch in chunks to avoid too long date ranges
            min_date = min(dates)
            max_date = max(dates)

            result = self.backfill_symbol(
                db, symbol, min_date, max_date, source
            )
            results[symbol] = result

            time.sleep(settings.RATE_LIMIT_DELAY)

        success = sum(1 for r in results.values() if r.get("success"))
        failed = len(results) - success

        return {
            "total": len(symbols),
            "success": success,
            "failed": failed,
            "results": results
        }
