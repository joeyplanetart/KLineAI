from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

# Initialize Celery
celery_app = Celery(
    "worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL
)

# Configure Celery
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Shanghai",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,  # 1 hour max per task
    worker_prefetch_multiplier=1,
)

# Task routes for different queues
celery_app.conf.task_routes = {
    # Data collection tasks - high priority
    "app.tasks.daily_tasks.*": {"queue": "data-collection"},
    "app.tasks.realtime_tasks.*": {"queue": "realtime"},
    # Maintenance tasks - low priority
    "app.tasks.maintenance_tasks.*": {"queue": "maintenance"},
}

# Beat schedule for periodic tasks
celery_app.conf.beat_schedule = {
    # Daily historical data update - runs at 16:00 (after market close) on weekdays
    "daily-historical-update": {
        "task": "app.tasks.daily_tasks.update_daily_data",
        "schedule": crontab(hour=16, minute=0, day_of_week="1-5"),
        "options": {"queue": "data-collection"},
    },

    # Weekly full market backfill - runs Sunday at 2:00 AM
    "weekly-full-backfill": {
        "task": "app.tasks.daily_tasks.full_market_backfill",
        "schedule": crontab(hour=2, minute=0, day_of_week=0),
        "options": {"queue": "data-collection"},
    },

    # Sync stock list - runs daily at 9:00 before market open
    "sync-stock-list": {
        "task": "app.tasks.daily_tasks.sync_stock_list_task",
        "schedule": crontab(hour=9, minute=0, day_of_week="1-5"),
        "options": {"queue": "data-collection"},
    },

    # Incremental update - runs every 30 minutes during trading hours
    "incremental-update": {
        "task": "app.tasks.daily_tasks.incremental_update_task",
        "schedule": 1800.0,  # 30 minutes in seconds
        "options": {"queue": "data-collection"},
    },

    # Real-time quote update - runs every 30 seconds during market hours
    "realtime-quote-update": {
        "task": "app.tasks.realtime_tasks.update_realtime_quotes",
        "schedule": 30.0,
        "options": {"queue": "realtime"},
    },

    # Market index update - runs every 60 seconds during market hours
    "market-index-update": {
        "task": "app.tasks.realtime_tasks.update_market_indices",
        "schedule": 60.0,
        "options": {"queue": "realtime"},
    },

    # Data quality check - runs at 17:00 after daily update on weekdays
    "data-quality-check": {
        "task": "app.tasks.maintenance_tasks.run_data_quality_check",
        "schedule": crontab(hour=17, minute=0, day_of_week="1-5"),
        "options": {"queue": "maintenance"},
    },

    # Cache cleanup - runs daily at 3:00 AM
    "cache-cleanup": {
        "task": "app.tasks.maintenance_tasks.cleanup_cache",
        "schedule": crontab(hour=3, minute=0),
        "options": {"queue": "maintenance"},
    },

    # TimescaleDB maintenance - runs weekly Sunday at 3:00 AM
    "timescale-maintenance": {
        "task": "app.tasks.maintenance_tasks.timescale_maintenance",
        "schedule": crontab(hour=3, minute=0, day_of_week=0),
        "options": {"queue": "maintenance"},
    },
}

# Import tasks to register them with Celery
from app.tasks.daily_tasks import update_daily_data, full_market_backfill, sync_stock_list_task, incremental_update_task
from app.tasks.realtime_tasks import update_realtime_quotes, update_market_indices
from app.tasks.maintenance_tasks import run_data_quality_check, cleanup_cache, timescale_maintenance
