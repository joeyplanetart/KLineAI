from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from celery.result import AsyncResult
from app.core.db import get_db
from app.core.celery_app import celery_app

router = APIRouter()


# Celery task definitions with metadata
TASK_DEFINITIONS = {
    # Daily tasks
    "app.tasks.daily_tasks.update_daily_data": {
        "name": "每日收盘数据更新",
        "description": "每日16:00自动执行，更新所有股票当日行情数据",
        "queue": "data-collection",
        "schedule": "每个交易日 16:00",
        "category": "daily"
    },
    "app.tasks.daily_tasks.full_market_backfill": {
        "name": "全市场历史回填",
        "description": "每周日02:00自动执行，补充历史缺失数据",
        "queue": "data-collection",
        "schedule": "每周日 02:00",
        "category": "weekly"
    },
    "app.tasks.daily_tasks.sync_stock_list_task": {
        "name": "同步股票列表",
        "description": "每日09:00自动执行，同步全市场股票列表",
        "queue": "data-collection",
        "schedule": "每个交易日 09:00",
        "category": "daily"
    },
    "app.tasks.daily_tasks.incremental_update_task": {
        "name": "增量更新",
        "description": "每30分钟执行，补充最新数据",
        "queue": "data-collection",
        "schedule": "每30分钟",
        "category": "interval"
    },

    # Realtime tasks
    "app.tasks.realtime_tasks.update_realtime_quotes": {
        "name": "实时行情更新",
        "description": "每30秒执行，更新股票实时报价",
        "queue": "realtime",
        "schedule": "每30秒",
        "category": "realtime"
    },
    "app.tasks.realtime_tasks.update_market_indices": {
        "name": "市场指数更新",
        "description": "每60秒执行，更新市场指数数据",
        "queue": "realtime",
        "schedule": "每60秒",
        "category": "realtime"
    },

    # Maintenance tasks
    "app.tasks.maintenance_tasks.run_data_quality_check": {
        "name": "数据质量检查",
        "description": "每日17:00自动执行，检查数据异常",
        "queue": "maintenance",
        "schedule": "每个交易日 17:00",
        "category": "daily"
    },
    "app.tasks.maintenance_tasks.cleanup_cache": {
        "name": "缓存清理",
        "description": "每日03:00自动执行，清理过期缓存",
        "queue": "maintenance",
        "schedule": "每日 03:00",
        "category": "daily"
    },
    "app.tasks.maintenance_tasks.timescale_maintenance": {
        "name": "TimescaleDB维护",
        "description": "每周日03:00自动执行，压缩旧数据",
        "queue": "maintenance",
        "schedule": "每周日 03:00",
        "category": "weekly"
    },
}


class TaskInfo(BaseModel):
    task_name: str
    display_name: str
    description: str
    queue: str
    schedule: str
    category: str
    last_run: Optional[str] = None
    last_status: Optional[str] = None
    is_enabled: bool = True


class TaskListResponse(BaseModel):
    tasks: List[TaskInfo]
    total: int
    categories: List[str]


class TaskExecutionRequest(BaseModel):
    task_name: str
    args: List[Any] = []
    kwargs: Dict[str, Any] = {}


class TaskExecutionResponse(BaseModel):
    success: bool
    task_id: str
    task_name: str
    status: str
    message: str


class TaskStatusResponse(BaseModel):
    task_id: str
    task_name: str
    status: str
    result: Optional[Any] = None
    traceback: Optional[str] = None
    date_done: Optional[str] = None


# Store recent task executions (in-memory, for demo purposes)
_recent_executions: Dict[str, Dict] = {}


def _get_task_last_run(task_name: str) -> Optional[str]:
    """Get last run time of a task from recent executions"""
    if task_name in _recent_executions:
        return _recent_executions[task_name].get("date_done")
    return None


def _get_task_last_status(task_name: str) -> Optional[str]:
    """Get last status of a task"""
    if task_name in _recent_executions:
        return _recent_executions[task_name].get("status")
    return None


@router.get("/", response_model=TaskListResponse)
def list_tasks():
    """
    Get list of all scheduled tasks with their metadata.
    """
    tasks = []
    categories = set()

    for task_name, info in TASK_DEFINITIONS.items():
        task = TaskInfo(
            task_name=task_name,
            display_name=info["name"],
            description=info["description"],
            queue=info["queue"],
            schedule=info["schedule"],
            category=info["category"],
            last_run=_get_task_last_run(task_name),
            last_status=_get_task_last_status(task_name),
            is_enabled=True  # Would be stored in DB for real implementation
        )
        tasks.append(task)
        categories.add(info["category"])

    return TaskListResponse(
        tasks=tasks,
        total=len(tasks),
        categories=sorted(list(categories))
    )


@router.get("/{task_name}")
def get_task(task_name: str):
    """Get details of a specific task"""
    if task_name not in TASK_DEFINITIONS:
        raise HTTPException(status_code=404, detail=f"Task '{task_name}' not found")

    info = TASK_DEFINITIONS[task_name]

    return {
        "task_name": task_name,
        "display_name": info["name"],
        "description": info["description"],
        "queue": info["queue"],
        "schedule": info["schedule"],
        "category": info["category"],
        "last_run": _get_task_last_run(task_name),
        "last_status": _get_task_last_status(task_name),
        "is_enabled": True
    }


@router.post("/execute", response_model=TaskExecutionResponse)
def execute_task(request: TaskExecutionRequest):
    """
    Manually trigger a task execution.
    """
    task_name = request.task_name

    if task_name not in TASK_DEFINITIONS:
        raise HTTPException(status_code=404, detail=f"Task '{task_name}' not found")

    try:
        # Get the actual task from celery
        task = celery_app.send_task(
            task_name,
            args=request.args,
            kwargs=request.kwargs
        )

        # Store execution info
        _recent_executions[task_name] = {
            "task_id": task.id,
            "status": "PENDING",
            "date_done": None
        }

        return TaskExecutionResponse(
            success=True,
            task_id=task.id,
            task_name=task_name,
            status="PENDING",
            message=f"Task '{TASK_DEFINITIONS[task_name]['name']}' triggered successfully"
        )

    except Exception as e:
        return TaskExecutionResponse(
            success=False,
            task_id="",
            task_name=task_name,
            status="FAILED",
            message=f"Failed to trigger task: {str(e)}"
        )


@router.get("/status/{task_id}", response_model=TaskStatusResponse)
def get_task_status(task_id: str):
    """
    Get the status of a task execution.
    """
    try:
        result = AsyncResult(task_id, app=celery_app)

        response = TaskStatusResponse(
            task_id=task_id,
            task_name=result.task_name or "unknown",
            status=result.status,
            result=result.result if result.ready() else None,
            traceback=result.traceback if result.ready() else None,
            date_done=result.date_done.isoformat() if result.date_done else None
        )

        # Update recent executions
        if result.task_name in _recent_executions:
            _recent_executions[result.task_name].update({
                "status": result.status,
                "date_done": response.date_done
            })

        return response

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get task status: {str(e)}")


@router.get("/executions/recent")
def get_recent_executions(limit: int = 50):
    """
    Get recent task executions.
    """
    executions = []

    for task_name, info in _recent_executions.items():
        executions.append({
            "task_name": task_name,
            "display_name": TASK_DEFINITIONS.get(task_name, {}).get("name", task_name),
            **info
        })

    # Sort by date_done descending
    executions.sort(key=lambda x: x.get("date_done") or "", reverse=True)

    return {"executions": executions[:limit], "total": len(executions)}


@router.get("/queues")
def get_queues():
    """
    Get list of Celery queues and their status.
    """
    return {
        "queues": [
            {"name": "data-collection", "description": "数据采集任务", "tasks": []},
            {"name": "realtime", "description": "实时任务", "tasks": []},
            {"name": "maintenance", "description": "维护任务", "tasks": []},
        ],
        "active_workers": "1"  # Would inspect actual workers
    }


@router.post("/revoke/{task_id}")
def revoke_task(task_id: str):
    """
    Revoke/terminate a running task.
    """
    try:
        celery_app.control.revoke(task_id, terminate=True)
        return {
            "success": True,
            "task_id": task_id,
            "message": "Task revoked successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to revoke task: {str(e)}")
