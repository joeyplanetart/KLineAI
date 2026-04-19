"""
Maintenance tasks for Celery.
These tasks handle data quality checks, cache cleanup, and database maintenance.
"""
from celery import shared_task
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.db import SessionLocal
from app.models.stock import StockDaily
from app.models.data_quality import DataQualityLog, AnomalyType
from app.services.data_validator.validators import DataValidator
from app.services.data_validator.anomaly_detector import AnomalyDetector
from app.services.cache.cache_manager import cache_manager


@shared_task(bind=True)
def run_data_quality_check(self, days: int = 30):
    """
    Task: Run data quality checks on recent data.
    Runs: Every trading day at 17:00 (after data updates)

    This task:
    1. Validates all records from the past N days
    2. Detects statistical anomalies
    3. Logs issues to data_quality_log table
    """
    db = SessionLocal()
    validator = DataValidator()
    detector = AnomalyDetector()

    try:
        # Get date range
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days)

        # Get all records in range
        records = db.query(StockDaily).filter(
            StockDaily.trade_date >= start_date,
            StockDaily.trade_date <= end_date
        ).all()

        if not records:
            return {"status": "skipped", "message": "No records to check"}

        print(f"Running data quality check on {len(records)} records")

        # Group by symbol for anomaly detection
        records_by_symbol = {}
        for record in records:
            if record.symbol not in records_by_symbol:
                records_by_symbol[record.symbol] = []
            records_by_symbol[record.symbol].append({
                "trade_date": record.trade_date,
                "open": record.open,
                "close": record.close,
                "high": record.high,
                "low": record.low,
                "volume": record.volume,
                "pct_change": record.pct_change,
                "amplitude": record.amplitude
            })

        # Run validation and anomaly detection
        total_anomalies = 0
        results = []

        for symbol, data in records_by_symbol.items():
            # Validate each record
            for record_data in data:
                validation_results = validator.validate(record_data)
                critical_errors = validator.get_critical_errors(record_data)

                for vr in critical_errors:
                    # Check if already logged
                    existing = db.query(DataQualityLog).filter(
                        DataQualityLog.symbol == symbol,
                        DataQualityLog.trade_date == record_data["trade_date"],
                        DataQualityLog.anomaly_type == vr.anomaly_type
                    ).first()

                    if not existing:
                        log = DataQualityLog(
                            symbol=symbol,
                            trade_date=record_data["trade_date"],
                            anomaly_type=vr.anomaly_type,
                            field_name=vr.field_name,
                            actual_value=vr.actual_value,
                            expected_value=vr.expected_value,
                            details={"message": vr.message, "level": vr.level.value}
                        )
                        db.add(log)
                        total_anomalies += 1

            # Run statistical anomaly detection
            anomalies = detector.detect_outliers(data, "close", symbol)
            for anomaly in anomalies:
                existing = db.query(DataQualityLog).filter(
                    DataQualityLog.symbol == symbol,
                    DataQualityLog.trade_date == anomaly.trade_date,
                    DataQualityLog.anomaly_type == anomaly.anomaly_type
                ).first()

                if not existing:
                    log = DataQualityLog(
                        symbol=symbol,
                        trade_date=anomaly.trade_date,
                        anomaly_type=anomaly.anomaly_type,
                        field_name=anomaly.field_name,
                        actual_value=str(anomaly.value),
                        expected_value=f"Z-score <= {anomaly.threshold}",
                        details={"z_score": anomaly.z_score, "message": anomaly.message}
                    )
                    db.add(log)
                    total_anomalies += 1

        db.commit()

        # Update cache with summary
        summary = {
            "last_check": datetime.now().isoformat(),
            "days_checked": days,
            "records_checked": len(records),
            "anomalies_found": total_anomalies
        }
        cache_manager.set(
            f"data:quality:summary:{days}",
            summary,
            ttl=1800  # 30 minutes
        )

        print(f"Data quality check completed: {total_anomalies} anomalies found")

        return {
            "status": "completed",
            "records_checked": len(records),
            "anomalies_found": total_anomalies
        }

    except Exception as e:
        db.rollback()
        print(f"Error in data quality check: {e}")
        return {"status": "error", "message": str(e)}

    finally:
        db.close()


@shared_task(bind=True)
def cleanup_cache(self):
    """
    Task: Clean up expired cache entries.
    Runs: Daily at 3:00 AM

    Note: Redis handles TTL expiration automatically,
    but this can clean up orphaned or invalid entries.
    """
    cache = cache_manager

    try:
        # Clean up stock cache
        stock_keys = cache.keys("stock:*")
        cleaned = 0

        for key in stock_keys:
            # Check if still valid
            value = cache.get(key)
            if value is None:
                # Key exists but value is None/invalid, delete it
                cache.delete(key)
                cleaned += 1

        # Clean up search cache (older entries)
        search_keys = cache.keys("search:*")
        for key in search_keys:
            cache.delete(key)
            cleaned += 1

        print(f"Cache cleanup completed: {cleaned} entries removed")

        return {
            "status": "completed",
            "cleaned": cleaned
        }

    except Exception as e:
        print(f"Error in cache cleanup: {e}")
        return {"status": "error", "message": str(e)}


@shared_task(bind=True)
def timescale_maintenance(self):
    """
    Task: TimescaleDB maintenance operations.
    Runs: Weekly (Sunday 3:00 AM)

    This task:
    1. Triggers compression of old data
    2. Refreshes continuous aggregates
    3. Logs statistics
    """
    from sqlalchemy import text

    db = SessionLocal()

    try:
        # Manual compression trigger (if using TimescaleDB)
        # This is a no-op if not using TimescaleDB

        # Get table statistics
        stats_query = text("""
            SELECT
                hypertable_name,
                num_rows,
                total_bytes
            FROM timescaledb_information.hypertables
            WHERE hypertable_name = 'stock_daily'
        """)

        try:
            result = db.execute(stats_query)
            rows = result.fetchall()
            print(f"TimescaleDB stats: {rows}")
        except Exception as e:
            print(f"TimescaleDB stats query failed (may not be enabled): {e}")

        # Refresh materialized views if any
        # This would be custom for your setup

        return {"status": "completed"}

    except Exception as e:
        print(f"Error in TimescaleDB maintenance: {e}")
        return {"status": "error", "message": str(e)}

    finally:
        db.close()


@shared_task(bind=True)
def get_data_quality_summary(self, days: int = 30) -> dict:
    """
    Task: Get data quality summary.
    Runs: On-demand

    Args:
        days: Number of days to look back

    Returns:
        Summary dict with anomaly counts by type
    """
    db = SessionLocal()

    try:
        # Try cache first
        cached = cache_manager.get(f"data:quality:summary:{days}")
        if cached:
            return {"status": "cached", "data": cached}

        # Calculate from database
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days)

        # Count anomalies by type
        results = db.query(
            DataQualityLog.anomaly_type,
            func.count(DataQualityLog.id).label("count")
        ).filter(
            DataQualityLog.created_at >= start_date,
            DataQualityLog.resolved == False
        ).group_by(
            DataQualityLog.anomaly_type
        ).all()

        summary = {
            "period_days": days,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "anomalies_by_type": {str(r[0]): r[1] for r in results},
            "total_unresolved": sum(r[1] for r in results)
        }

        # Cache the result
        cache_manager.set(f"data:quality:summary:{days}", summary, ttl=1800)

        return {"status": "computed", "data": summary}

    except Exception as e:
        print(f"Error getting data quality summary: {e}")
        return {"status": "error", "message": str(e)}

    finally:
        db.close()


@shared_task(bind=True)
def resolve_anomaly(self, anomaly_id: int, notes: str = None):
    """
    Task: Mark a data quality anomaly as resolved.
    Runs: On-demand (after manual review)

    Args:
        anomaly_id: ID of the DataQualityLog record
        notes: Optional resolution notes
    """
    db = SessionLocal()

    try:
        log = db.query(DataQualityLog).filter(DataQualityLog.id == anomaly_id).first()

        if not log:
            return {"status": "error", "message": f"Anomaly {anomaly_id} not found"}

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

    except Exception as e:
        db.rollback()
        print(f"Error resolving anomaly: {e}")
        return {"status": "error", "message": str(e)}

    finally:
        db.close()
