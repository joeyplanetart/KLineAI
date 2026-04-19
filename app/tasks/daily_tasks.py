"""
Daily data collection tasks for Celery.
These tasks run on scheduled intervals for daily market data updates.
"""
from celery import shared_task
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.services.data_collector.batch_collector import BatchCollector
from app.services.data_collector.historical_collector import HistoricalCollector
from app.services.data_source_manager import data_source_manager


@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def update_daily_data(self):
    """
    Task: Update daily data for all active stocks after market close.
    Runs: Every trading day at 16:00 (after market close)

    This task:
    1. Fetches today's data for all active stocks
    2. Updates the database with new records
    3. Reports any fetch failures
    """
    db = SessionLocal()
    collector = BatchCollector()

    try:
        # Get all active symbols
        symbols = collector.collect_stock_list(db)

        if not symbols:
            print("No active stocks found, skipping daily update")
            return {"status": "skipped", "message": "No active stocks"}

        # Calculate date range (just today)
        today = datetime.now().strftime("%Y%m%d")
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y%m%d")

        print(f"Starting daily update for {len(symbols)} stocks")

        # Batch fetch
        result = collector.batch_fetch(
            db,
            symbols,
            yesterday,
            today,
            source="baostock"
        )

        print(f"Daily update completed: {result['success']}/{result['total']} successful")

        return {
            "status": "completed",
            "total": result["total"],
            "success": result["success"],
            "failed": result["failed"]
        }

    except Exception as e:
        print(f"Error in daily update task: {e}")
        raise self.retry(exc=e)

    finally:
        db.close()


@shared_task(bind=True, max_retries=3, default_retry_delay=3600)
def full_market_backfill(self, start_date: str = "19900101", end_date: str = None):
    """
    Task: Full market historical data backfill.
    Runs: Weekly (Sunday 02:00) or on-demand

    This task:
    1. Syncs stock list from data source
    2. Backfills historical data for all stocks
    3. Can take hours to complete for full market

    Args:
        start_date: Start date for backfill (YYYYMMDD)
        end_date: End date for backfill (YYYYMMDD, default today)
    """
    db = SessionLocal()
    collector = BatchCollector()
    historical = HistoricalCollector()

    try:
        # First sync stock list
        print("Syncing stock list...")
        sync_result = collector.sync_stock_list(db)
        print(f"Stock sync result: {sync_result}")

        # Get all symbols
        symbols = collector.collect_stock_list(db)

        if not symbols:
            return {"status": "failed", "message": "No stocks found after sync"}

        if end_date is None:
            end_date = datetime.now().strftime("%Y%m%d")

        print(f"Starting full backfill for {len(symbols)} stocks from {start_date} to {end_date}")

        # Full backfill
        result = historical.backfill_batch(
            db,
            symbols,
            start_date,
            end_date,
            source="baostock"
        )

        print(f"Full backfill completed: {result['success']}/{result['total']} successful")

        return {
            "status": "completed",
            "start_date": start_date,
            "end_date": end_date,
            "total": result["total"],
            "success": result["success"],
            "failed": result["failed"]
        }

    except Exception as e:
        print(f"Error in full backfill task: {e}")
        raise self.retry(exc=e)

    finally:
        db.close()


@shared_task(bind=True)
def sync_stock_list_task(self):
    """
    Task: Sync stock list from data source to database.
    Runs: Daily at 9:00 (before market open)
    """
    db = SessionLocal()
    collector = BatchCollector()

    try:
        result = collector.sync_stock_list(db)
        print(f"Stock list sync completed: {result}")
        return result

    except Exception as e:
        print(f"Error syncing stock list: {e}")
        return {"status": "error", "message": str(e)}

    finally:
        db.close()


@shared_task(bind=True)
def incremental_update_task(self, days: int = 5):
    """
    Task: Incrementally update data for recent days.
    Runs: Every 30 minutes during trading hours

    Args:
        days: Number of days to update
    """
    db = SessionLocal()
    collector = BatchCollector()

    try:
        result = collector.incremental_update(db, days=days)
        print(f"Incremental update completed: {result}")
        return result

    except Exception as e:
        print(f"Error in incremental update: {e}")
        return {"status": "error", "message": str(e)}

    finally:
        db.close()
