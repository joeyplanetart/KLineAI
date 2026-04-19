from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
from app.core.db import get_db
from app.core.security import get_current_user, get_current_admin
from app.models.user import User
from app.models.model_usage import ModelUsage

router = APIRouter()


class UsageSummary(BaseModel):
    total_calls: int
    total_tokens: int
    total_cost: float
    avg_latency_ms: float


class UsageByModel(BaseModel):
    model: str
    calls: int
    total_tokens: int
    cost: float


class UsageTrendItem(BaseModel):
    date: str
    calls: int
    tokens: int
    cost: float


class UsageResponse(BaseModel):
    summary: UsageSummary
    by_model: List[UsageByModel]
    recent_trend: List[UsageTrendItem]


@router.get("/usage", response_model=UsageResponse)
def get_usage_stats(
    days: int = 7,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    start_date = datetime.utcnow() - timedelta(days=days)

    if current_user.role.value == "admin":
        base_query = db.query(ModelUsage)
    else:
        base_query = db.query(ModelUsage).filter(ModelUsage.user_id == current_user.id)

    usage_records = base_query.filter(ModelUsage.created_at >= start_date).all()

    total_calls = len(usage_records)
    total_tokens = sum(r.total_tokens or 0 for r in usage_records)
    total_cost = sum(r.cost or 0.0 for r in usage_records)
    avg_latency = (sum(r.latency_ms or 0 for r in usage_records) / total_calls) if total_calls > 0 else 0

    summary = UsageSummary(
        total_calls=total_calls,
        total_tokens=total_tokens,
        total_cost=round(total_cost, 6),
        avg_latency_ms=round(avg_latency, 2)
    )

    if current_user.role.value == "admin":
        model_stats = db.query(
            ModelUsage.model,
            func.count(ModelUsage.id).label('calls'),
            func.sum(ModelUsage.total_tokens).label('total_tokens'),
            func.sum(ModelUsage.cost).label('cost')
        ).filter(ModelUsage.created_at >= start_date).group_by(ModelUsage.model).all()
    else:
        model_stats = db.query(
            ModelUsage.model,
            func.count(ModelUsage.id).label('calls'),
            func.sum(ModelUsage.total_tokens).label('total_tokens'),
            func.sum(ModelUsage.cost).label('cost')
        ).filter(
            ModelUsage.created_at >= start_date,
            ModelUsage.user_id == current_user.id
        ).group_by(ModelUsage.model).all()

    by_model = [
        UsageByModel(
            model=stat.model,
            calls=stat.calls,
            total_tokens=stat.total_tokens or 0,
            cost=round(stat.cost or 0.0, 6)
        ) for stat in model_stats
    ]

    if current_user.role.value == "admin":
        trend_data = db.query(
            func.date(ModelUsage.created_at).label('date'),
            func.count(ModelUsage.id).label('calls'),
            func.sum(ModelUsage.total_tokens).label('tokens'),
            func.sum(ModelUsage.cost).label('cost')
        ).filter(ModelUsage.created_at >= start_date).group_by(
            func.date(ModelUsage.created_at)
        ).order_by(func.date(ModelUsage.created_at)).all()
    else:
        trend_data = db.query(
            func.date(ModelUsage.created_at).label('date'),
            func.count(ModelUsage.id).label('calls'),
            func.sum(ModelUsage.total_tokens).label('tokens'),
            func.sum(ModelUsage.cost).label('cost')
        ).filter(
            ModelUsage.created_at >= start_date,
            ModelUsage.user_id == current_user.id
        ).group_by(
            func.date(ModelUsage.created_at)
        ).order_by(func.date(ModelUsage.created_at)).all()

    recent_trend = [
        UsageTrendItem(
            date=str(stat.date),
            calls=stat.calls,
            tokens=stat.tokens or 0,
            cost=round(stat.cost or 0.0, 6)
        ) for stat in trend_data
    ]

    return UsageResponse(
        summary=summary,
        by_model=by_model,
        recent_trend=recent_trend
    )
