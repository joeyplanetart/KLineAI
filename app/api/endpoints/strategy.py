from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from app.services.llm_service import llm_service
from app.services.backtest import backtest_engine
from app.core.db import get_db
from app.models.stock import StockDaily

router = APIRouter()

class StrategyRequest(BaseModel):
    description: str

class StrategyResponse(BaseModel):
    code: str
    usage: Optional[Dict[str, Any]] = None

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

@router.post("/generate", response_model=StrategyResponse)
def generate_strategy(request: StrategyRequest):
    """
    Generate trading strategy code based on natural language description using LLM.
    """
    result = llm_service.generate_strategy_code(request.description)
    return StrategyResponse(code=result["code"], usage=result.get("usage"))


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


@router.get("/list")
def list_strategies():
    """
    List all saved strategies.
    """
    # TODO: 从数据库读取已保存的策略
    return {
        "strategies": [
            {"id": 1, "name": "双均线策略", "description": "MA5/MA20 金叉死叉", "created_at": "2024-01-15"},
            {"id": 2, "name": "RSI 超买超卖", "description": "RSI 指标策略", "created_at": "2024-01-14"},
        ]
    }


@router.get("/{strategy_id}")
def get_strategy(strategy_id: int):
    """
    Get a specific strategy by ID.
    """
    # TODO: 从数据库读取策略详情
    return {
        "id": strategy_id,
        "name": "双均线策略",
        "description": "MA5/MA20 金叉死叉",
        "code": "# 双均线策略代码\n...",
        "created_at": "2024-01-15"
    }
