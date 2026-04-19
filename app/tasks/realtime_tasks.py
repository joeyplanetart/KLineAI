"""
Real-time data collection tasks for Celery.
These tasks run at short intervals for live market data updates.
"""
from celery import shared_task
from datetime import datetime
from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.services.data_collector.realtime_collector import RealtimeCollector, MarketStatusChecker
from app.services.data_collector.batch_collector import BatchCollector


@shared_task(bind=True)
def update_realtime_quotes(self):
    """
    Task: Update real-time quotes for tracked stocks.
    Runs: Every 30 seconds during trading hours

    This task:
    1. Checks if market is open
    2. Fetches quotes for active stocks
    3. Updates Redis cache
    """
    db = SessionLocal()
    collector = RealtimeCollector(poll_interval=0)  # One-time fetch, no internal loop

    try:
        # Check if market is open
        if not MarketStatusChecker.should_update_realtime():
            session = MarketStatusChecker.get_market_session()
            return {
                "status": "skipped",
                "message": f"Market session: {session}",
                "updated": 0
            }

        # Get all active symbols
        batch_collector = BatchCollector()
        symbols = batch_collector.collect_stock_list(db)

        if not symbols:
            return {"status": "skipped", "message": "No active stocks"}

        # Limit to top stocks for realtime to avoid rate limits
        # In production, could use a watchlist or filter by market cap
        symbols = symbols[:100]  # Limit to 100 stocks

        # Fetch quotes
        results = collector.fetch_batch_realtime(symbols)

        return {
            "status": "completed",
            "updated": len(results),
            "total_symbols": len(symbols)
        }

    except Exception as e:
        print(f"Error updating realtime quotes: {e}")
        return {"status": "error", "message": str(e)}

    finally:
        db.close()


@shared_task(bind=True)
def update_market_indices(self):
    """
    Task: Update market index data.
    Runs: Every 60 seconds during trading hours

    Updates indices: SSE Composite, SZSE Component, ChiNext
    """
    collector = RealtimeCollector(poll_interval=0)

    try:
        # Check if market is open
        if not MarketStatusChecker.should_update_realtime():
            return {
                "status": "skipped",
                "message": f"Market session: {MarketStatusChecker.get_market_session()}"
            }

        # Update indices
        indices = collector.update_market_indices()

        return {
            "status": "completed",
            "updated": len(indices),
            "indices": list(indices.keys())
        }

    except Exception as e:
        print(f"Error updating market indices: {e}")
        return {"status": "error", "message": str(e)}


@shared_task(bind=True)
def start_realtime_collector(self):
    """
    Task: Start the background realtime collector.
    Runs: Once at system startup (or when needed)

    Note: This starts a persistent background task that runs
    until explicitly stopped.
    """
    collector = RealtimeCollector(poll_interval=30)

    if collector.is_running():
        return {"status": "already_running"}

    # Get symbols to track
    db = SessionLocal()
    try:
        batch_collector = BatchCollector()
        symbols = batch_collector.collect_stock_list(db)[:100]  # Limit to 100
    finally:
        db.close()

    collector.start_background_updates(symbols)

    return {
        "status": "started",
        "symbols_count": len(symbols),
        "poll_interval": collector.poll_interval
    }


@shared_task(bind=True)
def stop_realtime_collector(self):
    """
    Task: Stop the background realtime collector.
    Runs: On-demand or scheduled shutdown
    """
    collector = RealtimeCollector(poll_interval=0)

    if not collector.is_running():
        return {"status": "not_running"}

    collector.stop_background_updates()

    return {"status": "stopped"}


@shared_task(bind=True)
def get_realtime_quote(self, symbol: str):
    """
    Task: Get real-time quote for a specific symbol.
    Runs: On-demand

    Args:
        symbol: Stock symbol (e.g., 'sh600000')

    Returns:
        Quote data dict
    """
    collector = RealtimeCollector(poll_interval=0)

    # Try cache first
    cached = collector.get_cached_quote(symbol)
    if cached:
        return {"status": "cached", "data": cached}

    # Fetch fresh
    quote = collector.fetch_realtime_quote(symbol)
    if quote:
        return {"status": "fresh", "data": quote}

    return {"status": "error", "message": f"Failed to fetch quote for {symbol}"}
