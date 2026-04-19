import time
import asyncio
from typing import List, Dict, Optional, Callable
from datetime import datetime
from sqlalchemy.orm import Session

from app.core.config import settings
from app.services.cache.cache_manager import cache_manager, CacheKey, CacheTTL
from app.models.stock import StockDaily
from app.models.stock_info import StockInfo, StockStatus


class RealtimeCollector:
    """
    Real-time data collector for fetching and caching live quotes.
    Polls at regular intervals and updates Redis cache.
    """

    def __init__(
        self,
        poll_interval: int = 30,
        cache_ttl: int = None
    ):
        """
        Args:
            poll_interval: Seconds between polls (default 30)
            cache_ttl: Cache TTL in seconds (default 30 for realtime)
        """
        self.poll_interval = poll_interval
        self.cache_ttl = cache_ttl or CacheTTL.REALTIME
        self.cache = cache_manager
        self._running = False
        self._task: Optional[asyncio.Task] = None

    def fetch_realtime_quote(self, symbol: str) -> Optional[Dict]:
        """
        Fetch real-time quote for a single stock.
        Returns dict with quote data or None if failed.
        """
        from app.services.data_source_manager import data_source_manager

        try:
            quote = data_source_manager.fetch_realtime(symbol)
            if quote:
                # Cache the quote
                self.cache.set_realtime_quote(symbol, quote, self.cache_ttl)
            return quote
        except Exception as e:
            print(f"Error fetching realtime quote for {symbol}: {e}")
            return None

    def fetch_batch_realtime(self, symbols: List[str]) -> Dict[str, Dict]:
        """
        Fetch real-time quotes for multiple stocks.
        Returns dict mapping symbol to quote data.
        """
        results = {}
        for symbol in symbols:
            quote = self.fetch_realtime_quote(symbol)
            if quote:
                results[symbol] = quote
            time.sleep(settings.RATE_LIMIT_DELAY)  # Rate limiting
        return results

    def get_cached_quote(self, symbol: str) -> Optional[Dict]:
        """Get cached real-time quote for a symbol"""
        return self.cache.get_realtime_quote(symbol)

    def get_cached_batch(self, symbols: List[str]) -> Dict[str, Dict]:
        """Get cached real-time quotes for multiple symbols"""
        results = {}
        for symbol in symbols:
            quote = self.cache.get_realtime_quote(symbol)
            if quote:
                results[symbol] = quote
        return results

    def update_market_indices(self) -> Dict[str, Dict]:
        """
        Update market index data (SSE, SZSE indices).
        Returns dict mapping index name to index data.
        """
        from app.services.data_source_manager import data_source_manager

        indices = {}
        index_codes = ["000001", "399001", "399006"]  #上证, 深证, 创业板

        for code in index_codes:
            try:
                quote = data_source_manager.fetch_realtime(code)
                if quote:
                    indices[code] = quote
                    self.cache.set_market_index(code, quote, CacheTTL.MARKET_INDEX)
            except Exception as e:
                print(f"Error fetching index {code}: {e}")

        return indices

    async def _poll_loop(self, symbols: List[str]):
        """Async polling loop for real-time updates"""
        while self._running:
            try:
                self.fetch_batch_realtime(symbols)
                self.update_market_indices()
            except Exception as e:
                print(f"Error in realtime poll loop: {e}")

            await asyncio.sleep(self.poll_interval)

    def start_background_updates(self, symbols: List[str]):
        """Start background polling task"""
        if self._running:
            print("Realtime collector already running")
            return

        self._running = True
        self._task = asyncio.create_task(self._poll_loop(symbols))
        print(f"Started realtime collector for {len(symbols)} symbols")

    def stop_background_updates(self):
        """Stop background polling task"""
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None
        print("Stopped realtime collector")

    def is_running(self) -> bool:
        """Check if collector is running"""
        return self._running

    def get_all_cached_quotes(self) -> Dict[str, Dict]:
        """Get all cached real-time quotes"""
        keys = self.cache.keys(CacheKey.REALTIME_QUOTE.value.format(symbol="*"))
        results = {}
        for key in keys:
            # Extract symbol from key
            symbol = key.split(":")[-1]
            quote = self.cache.get(key)
            if quote:
                results[symbol] = quote
        return results


class MarketStatusChecker:
    """
    Check if market is open, closed, pre-market, or after-hours.
    Useful for determining data update strategies.
    """

    @staticmethod
    def is_trading_day(check_date: datetime = None) -> bool:
        """Check if given date is a trading day (Monday-Friday, not holiday)"""
        if check_date is None:
            check_date = datetime.now()

        # Check if weekend
        if check_date.weekday() >= 5:  # Saturday or Sunday
            return False

        # TODO: Check against holiday calendar
        # For now, just check weekday
        return True

    @staticmethod
    def get_market_session(check_time: datetime = None) -> str:
        """
        Get current market session.
        Returns: 'pre_market', 'trading', 'lunch', 'after_hours', 'closed'
        """
        if check_time is None:
            check_time = datetime.now()

        if not MarketStatusChecker.is_trading_day(check_time):
            return "closed"

        hour = check_time.hour
        minute = check_time.minute
        current_time = hour * 60 + minute

        # Pre-market: 9:15 - 9:25
        if 9 * 60 + 15 <= current_time < 9 * 60 + 25:
            return "pre_market"

        # Morning trading: 9:30 - 11:30
        if 9 * 60 + 30 <= current_time < 11 * 60 + 30:
            return "trading"

        # Lunch break: 11:30 - 13:00
        if 11 * 60 + 30 <= current_time < 13 * 60:
            return "lunch"

        # Afternoon trading: 13:00 - 15:00
        if 13 * 60 <= current_time < 15 * 60:
            return "trading"

        # After-hours: 15:00 - 15:05 (closing auction)
        if 15 * 60 <= current_time < 15 * 60 + 5:
            return "after_hours"

        return "closed"

    @staticmethod
    def should_update_realtime() -> bool:
        """Check if realtime updates should be running"""
        session = MarketStatusChecker.get_market_session()
        return session in ["pre_market", "trading", "after_hours"]

    @staticmethod
    def should_update_daily() -> bool:
        """Check if daily data update should run"""
        session = MarketStatusChecker.get_market_session()
        # Update after trading session ends
        return session in ["after_hours", "closed"]
