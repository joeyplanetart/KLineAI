from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
import json
from app.services.llm_service import llm_service
from app.services.backtest import backtest_engine
from app.services.builtin_strategies import get_all_builtin_strategies, get_builtin_strategy
from app.core.db import get_db
from app.core.security import get_current_user, get_optional_user, get_current_admin
from app.models.stock import StockDaily
from app.models.strategy import Strategy, StrategyStatus
from app.models.user import User

router = APIRouter()

class StrategyGenerateRequest(BaseModel):
    description: str
    name: Optional[str] = None
    save: bool = False  # 是否保存策略

class StrategyResponse(BaseModel):
    id: Optional[int] = None
    name: str
    description: str
    code: str
    usage: Optional[Dict[str, Any]] = None
    status: Optional[str] = None
    created_at: Optional[datetime] = None

class StrategyListItem(BaseModel):
    id: int
    name: str
    description: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime

class StrategyListResponse(BaseModel):
    strategies: List[StrategyListItem]

class BacktestRequest(BaseModel):
    symbol: str
    strategy_code: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    initial_capital: float = 1000000

class BacktestResponse(BaseModel):
    strategy_code: str
    initial_capital: float
    final_value: float
    total_return: float
    sharpe_ratio: float
    max_drawdown: float
    total_trades: int
    trades: List[Dict[str, Any]]
    portfolio_values: List[Dict[str, Any]]

class BacktestStatusResponse(BaseModel):
    status: str
    message: str

class StrategySaveRequest(BaseModel):
    name: str
    description: str
    strategy_code: str
    status: Optional[str] = "draft"

@router.post("/generate", response_model=StrategyResponse)
def generate_strategy(
    request: StrategyGenerateRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    """
    Generate trading strategy code based on natural language description using LLM.
    If save=True, the strategy will be saved to database.
    """
    result = llm_service.generate_strategy_code(request.description)

    strategy_id = None
    status = None
    created_at = None

    # 保存策略
    if request.save and request.name:
        strategy = Strategy(
            name=request.name,
            description=request.description,
            strategy_code=result["code"],
            status=StrategyStatus.DRAFT,
            created_by=current_user.id if current_user else None
        )
        db.add(strategy)
        db.commit()
        db.refresh(strategy)
        strategy_id = strategy.id
        status = strategy.status.value
        created_at = strategy.created_at

    return StrategyResponse(
        id=strategy_id,
        name=request.name or "未命名策略",
        description=request.description,
        code=result["code"],
        usage=result.get("usage"),
        status=status,
        created_at=created_at
    )


@router.get("/builtin")
def list_builtin_strategies():
    """
    List all built-in strategies for quick selection.
    """
    return {"strategies": get_all_builtin_strategies()}


class ApplyBuiltinRequest(BaseModel):
    strategy_id: str
    name: str
    description: Optional[str] = None


@router.post("/builtin/apply", response_model=StrategyResponse)
def apply_builtin_strategy(
    request: ApplyBuiltinRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    """
    Apply a built-in strategy by copying it to user's strategies.
    """
    builtin = get_builtin_strategy(request.strategy_id)
    if not builtin:
        raise HTTPException(status_code=404, detail="Built-in strategy not found")

    strategy = Strategy(
        name=request.name,
        description=request.description or builtin["description"],
        strategy_code=builtin["code"],
        status=StrategyStatus.DRAFT,
        created_by=current_user.id if current_user else None
    )
    db.add(strategy)
    db.commit()
    db.refresh(strategy)

    return StrategyResponse(
        id=strategy.id,
        name=strategy.name,
        description=strategy.description or "",
        code=strategy.strategy_code,
        status=strategy.status.value,
        created_at=strategy.created_at
    )


@router.get("/builtin/{strategy_id}/code")
def get_builtin_strategy_code(strategy_id: str):
    """
    Get the code of a built-in strategy.
    """
    builtin = get_builtin_strategy(strategy_id)
    if not builtin:
        raise HTTPException(status_code=404, detail="Built-in strategy not found")
    return builtin


@router.post("/backtest", response_model=BacktestResponse)
def run_backtest(
    request: BacktestRequest,
    db: Session = Depends(get_db)
):
    """
    Run backtest for a strategy on historical data.
    """
    # 获取股票数据
    query = db.query(StockDaily).filter(StockDaily.symbol == request.symbol)

    if request.start_date:
        query = query.filter(StockDaily.trade_date >= request.start_date)
    if request.end_date:
        query = query.filter(StockDaily.trade_date <= request.end_date)

    stock_data = query.order_by(StockDaily.trade_date.asc()).all()

    if not stock_data:
        raise HTTPException(status_code=404, detail=f"No data found for symbol {request.symbol}")

    # 转换为 DataFrame
    df_data = []
    for record in stock_data:
        df_data.append({
            "date": record.trade_date,
            "open": record.open,
            "high": record.high,
            "low": record.low,
            "close": record.close,
            "volume": record.volume,
        })

    import pandas as pd
    df = pd.DataFrame(df_data)

    # 执行回测
    try:
        result = backtest_engine.backtest(
            data=df,
            strategy_code=request.strategy_code,
            initial_capital=request.initial_capital
        )

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        return BacktestResponse(**result)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backtest failed: {str(e)}")


@router.get("/list", response_model=StrategyListResponse)
def list_strategies(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    """
    List all saved strategies.
    """
    query = db.query(Strategy)
    if current_user:
        # 非管理员只看自己的策略
        if current_user.role.value != "admin":
            query = query.filter(Strategy.created_by == current_user.id)
    strategies = query.order_by(Strategy.updated_at.desc()).all()

    return StrategyListResponse(
        strategies=[
            StrategyListItem(
                id=s.id,
                name=s.name,
                description=s.description,
                status=s.status.value,
                created_at=s.created_at,
                updated_at=s.updated_at
            )
            for s in strategies
        ]
    )


@router.get("/{strategy_id}", response_model=StrategyResponse)
def get_strategy(
    strategy_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    """
    Get a specific strategy by ID.
    """
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    # 非管理员不能查看他人的策略
    if current_user and current_user.role.value != "admin" and strategy.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return StrategyResponse(
        id=strategy.id,
        name=strategy.name,
        description=strategy.description or "",
        code=strategy.strategy_code,
        status=strategy.status.value,
        created_at=strategy.created_at
    )


@router.put("/{strategy_id}", response_model=StrategyResponse)
def update_strategy(
    strategy_id: int,
    request: StrategySaveRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    """
    Update a strategy.
    """
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    # 非管理员不能修改他人的策略
    if current_user and current_user.role.value != "admin" and strategy.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    strategy.name = request.name
    strategy.description = request.description
    strategy.strategy_code = request.strategy_code
    if request.status:
        strategy.status = StrategyStatus(request.status)

    db.commit()
    db.refresh(strategy)

    return StrategyResponse(
        id=strategy.id,
        name=strategy.name,
        description=strategy.description or "",
        code=strategy.strategy_code,
        status=strategy.status.value,
        created_at=strategy.created_at
    )


@router.delete("/{strategy_id}")
def delete_strategy(
    strategy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """
    Delete a strategy. Admin or owner only.
    """
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    db.delete(strategy)
    db.commit()

    return {"message": "Strategy deleted"}


@router.post("/{strategy_id}/backtest", response_model=BacktestResponse)
def run_strategy_backtest(
    strategy_id: int,
    symbol: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    initial_capital: float = 1000000,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    """
    Run backtest for a saved strategy.
    """
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    # 获取股票数据
    query = db.query(StockDaily).filter(StockDaily.symbol == symbol)

    if start_date:
        query = query.filter(StockDaily.trade_date >= start_date)
    if end_date:
        query = query.filter(StockDaily.trade_date <= end_date)

    stock_data = query.order_by(StockDaily.trade_date.asc()).all()

    if not stock_data:
        raise HTTPException(status_code=404, detail=f"No data found for symbol {symbol}")

    # 转换为 DataFrame
    df_data = []
    for record in stock_data:
        df_data.append({
            "date": record.trade_date,
            "open": record.open,
            "high": record.high,
            "low": record.low,
            "close": record.close,
            "volume": record.volume,
        })

    import pandas as pd
    df = pd.DataFrame(df_data)

    # 执行回测
    try:
        result = backtest_engine.backtest(
            data=df,
            strategy_code=strategy.strategy_code,
            initial_capital=initial_capital
        )

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        # 保存回测结果到策略
        strategy.last_backtest_result = json.dumps(result, default=str)
        strategy.last_backtest_at = datetime.utcnow()
        db.commit()

        return BacktestResponse(**result)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backtest failed: {str(e)}")
