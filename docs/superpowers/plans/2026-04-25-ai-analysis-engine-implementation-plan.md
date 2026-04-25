# AI 智能分析引擎 - 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Dashboard 上替换行情监控视图为 AI 分析引擎，支持异步股票多维分析

**Architecture:** 后端异步任务处理 + 前端轮询，前端 AnalysisPanel 组件负责股票选择、结果展示、K线图渲染

**Tech Stack:** FastAPI + SQLAlchemy + PostgreSQL + React + TypeScript + MUI + ECharts + AKShare

---

## 文件结构

```
app/
├── models/
│   └── analysis.py          # 新建: AnalysisReport 模型
├── services/
│   └── analysis/
│       ├── __init__.py      # 新建
│       ├── service.py       # 新建: 主分析服务 + 异步任务
│       ├── macro_fetcher.py # 新建: 宏观数据获取
│       ├── technical.py     # 新建: 技术指标计算
│       ├── prompt_builder.py# 新建: LLM prompt 构建
│       └── report_generator.py # 新建: LLM 响应解析
├── api/endpoints/
│   └── analysis.py          # 新建: API 端点
└── main.py                   # 修改: 注册 analysis router

frontend/src/
├── components/
│   └── AnalysisPanel.tsx    # 新建: AI 分析面板组件
└── pages/
    └── dashboard.tsx        # 修改: 替换行情监控视图
```

---

## 任务列表

### Task 1: 创建 AnalysisReport 数据模型

**Files:**
- Create: `app/models/analysis.py`

```python
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Enum as SQLEnum, JSON
from app.core.db import Base
import enum
import uuid
from datetime import datetime

class AnalysisStatus(enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class AnalysisReport(Base):
    __tablename__ = "analysis_reports"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(10), index=True, nullable=False)
    name = Column(String(50))
    job_id = Column(String(36), unique=True, default=lambda: str(uuid.uuid4()))

    status = Column(SQLEnum(AnalysisStatus), default=AnalysisStatus.PENDING)

    # 核心结论
    recommendation = Column(String(10))  # HOLD/BUY/SELL
    confidence = Column(Float)  # 0-100

    # 四维评分
    composite_score = Column(Integer)  # 0-100
    technical_score = Column(Integer)  # 0-100
    fundamental_score = Column(Integer)  # 0-100
    sentiment_score = Column(Integer)  # 0-100

    # 周期预测
    cycle_predictions = Column(JSON)

    # 详细数据
    technical_details = Column(JSON)
    fundamental_details = Column(JSON)
    sentiment_details = Column(JSON)

    # 支撑阻力
    support_level = Column(Float)
    resistance_level = Column(Float)

    # 风险提示
    risk_warnings = Column(JSON)

    # AI 生成的完整文本报告
    report = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

---

### Task 2: 创建分析服务目录结构

**Files:**
- Create: `app/services/analysis/__init__.py`
- Create: `app/services/analysis/service.py`
- Create: `app/services/analysis/macro_fetcher.py`
- Create: `app/services/analysis/technical.py`
- Create: `app/services/analysis/prompt_builder.py`
- Create: `app/services/analysis/report_generator.py`

---

### Task 3: 实现 macro_fetcher.py - 宏观数据获取

**Files:**
- Create: `app/services/analysis/macro_fetcher.py`

**依赖:** akshare

```python
import akshare as ak
from typing import Dict, Optional, Tuple
import logging

logger = logging.getLogger(__name__)

class MacroFetcher:
    """获取宏观市场数据: DXY, VIX, 美债收益率, 新闻情绪"""

    def get_dxy_index(self) -> Optional[float]:
        """获取美元指数"""
        try:
            df = ak.currency_hist("USD/XR")
            if df is not None and not df.empty:
                return float(df.iloc[-1]["close"])
        except Exception as e:
            logger.warning(f"Failed to get DXY: {e}")
        return None

    def get_vix_index(self) -> Optional[float]:
        """获取 VIX 恐慌指数"""
        try:
            df = ak.vix_index()
            if df is not None and not df.empty:
                return float(df.iloc[-1]["close"])
        except Exception as e:
            logger.warning(f"Failed to get VIX: {e}")
        return None

    def get_us_bond_yield(self, duration: str = "10") -> Optional[float]:
        """获取美债收益率 (默认10年期)"""
        try:
            df = ak.us_bond_yield()
            if df is not None:
                row = df[df["duration"] == f"{duration}y"]
                if not row.empty:
                    return float(row.iloc[0]["yield"])
        except Exception as e:
            logger.warning(f"Failed to get US bond yield: {e}")
        return None

    def fetch_all(self) -> Dict[str, any]:
        """获取所有宏观数据"""
        return {
            "dxy": self.get_dxy_index(),
            "vix": self.get_vix_index(),
            "us_bond_10y": self.get_us_bond_yield("10"),
        }
```

---

### Task 4: 实现 technical.py - 技术指标计算

**Files:**
- Create: `app/services/analysis/technical.py`

**依赖:** pandas, numpy

```python
import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple
from app.models.stock import StockDaily

class TechnicalAnalyzer:
    """计算技术指标: RSI, MACD, 布林带, 均线, ATR"""

    def calculate_rsi(self, prices: pd.Series, period: int = 14) -> float:
        """计算 RSI"""
        delta = prices.diff()
        gain = delta.where(delta > 0, 0).rolling(period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(period).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        return round(rsi.iloc[-1], 2) if not pd.isna(rsi.iloc[-1]) else 50.0

    def calculate_macd(self, prices: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> Tuple[float, float, float]:
        """计算 MACD (DIF, DEA, HIST)"""
        ema_fast = prices.ewm(span=fast).mean()
        ema_slow = prices.ewm(span=slow).mean()
        dif = ema_fast - ema_slow
        dea = dif.ewm(span=signal).mean()
        hist = (dif - dea) * 2
        return round(dif.iloc[-1], 4), round(dea.iloc[-1], 4), round(hist.iloc[-1], 4)

    def calculate_bollinger_bands(self, prices: pd.Series, period: int = 20, std_dev: int = 2) -> Tuple[float, float, float]:
        """计算布林带 (upper, middle, lower)"""
        ma = prices.rolling(period).mean()
        std = prices.rolling(period).std()
        upper = ma + (std * std_dev)
        lower = ma - (std * std_dev)
        return round(upper.iloc[-1], 2), round(ma.iloc[-1], 2), round(lower.iloc[-1], 2)

    def calculate_ma(self, prices: pd.Series, periods: List[int] = [5, 10, 20, 60]) -> Dict[str, float]:
        """计算移动平均线"""
        result = {}
        for p in periods:
            ma = prices.rolling(p).mean()
            result[f"ma{p}"] = round(ma.iloc[-1], 2) if not pd.isna(ma.iloc[-1]) else None
        return result

    def calculate_atr(self, high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> float:
        """计算 ATR (Average True Range)"""
        tr = pd.concat([
            high - low,
            (high - close.shift()).abs(),
            (low - close.shift()).abs()
        ], axis=1).max(axis=1)
        atr = tr.rolling(period).mean()
        return round(atr.iloc[-1], 4) if not pd.isna(atr.iloc[-1]) else None

    def find_support_resistance(self, prices: pd.Series, lookback: int = 20) -> Tuple[Optional[float], Optional[float]]:
        """寻找支撑位和阻力位 (基于近20日高低点)"""
        recent = prices.iloc[-lookback:]
        support = round(recent.min(), 2)
        resistance = round(recent.max(), 2)
        return support, resistance

    def analyze(self, stock_data: List[StockDaily]) -> Dict:
        """综合技术分析"""
        if not stock_data:
            return {}

        df = pd.DataFrame([{
            "open": d.open,
            "high": d.high,
            "low": d.low,
            "close": d.close,
            "volume": d.volume,
        } for d in stock_data])

        prices = df["close"]
        high = df["high"]
        low = df["low"]

        # 计算各指标
        rsi = self.calculate_rsi(prices)
        macd_dif, macd_dea, macd_hist = self.calculate_macd(prices)
        bb_upper, bb_middle, bb_lower = self.calculate_bollinger_bands(prices)
        ma_dict = self.calculate_ma(prices)
        atr = self.calculate_atr(high, low, prices)
        support, resistance = self.find_support_resistance(prices)

        # 计算20日区间位置
        range_position = ((prices.iloc[-1] - low.min()) / (high.max() - low.min()) * 100) if high.max() > low.min() else 50

        # 计算成交量比 (当前成交量 / 20日平均)
        vol_avg = df["volume"].rolling(20).mean().iloc[-1]
        vol_ratio = round(df["volume"].iloc[-1] / vol_avg, 2) if vol_avg and vol_avg > 0 else 1.0

        # 布林带宽度百分比
        bb_width = round((bb_upper - bb_lower) / bb_middle * 100, 2) if bb_middle else 0

        return {
            "rsi": rsi,
            "macd": {
                "dif": macd_dif,
                "dea": macd_dea,
                "hist": macd_hist,
                "signal": "golden_cross" if macd_dif > macd_dea else "death_cross"
            },
            "bollinger_bands": {
                "upper": bb_upper,
                "middle": bb_middle,
                "lower": bb_lower,
                "width_pct": bb_width
            },
            "moving_averages": ma_dict,
            "atr": atr,
            "support_level": support,
            "resistance_level": resistance,
            "range_position_20d": round(range_position, 1),
            "volume_ratio": vol_ratio,
            "trend": "up" if ma_dict.get("ma5") and ma_dict.get("ma20") and ma_dict["ma5"] > ma_dict["ma20"] else "down"
        }
```

---

### Task 5: 实现 prompt_builder.py - 构建 LLM Prompt

**Files:**
- Create: `app/services/analysis/prompt_builder.py`

```python
from typing import Dict, Any

SYSTEM_PROMPT = """你是一位专业的量化交易分析师。你的任务是分析股票的技术面、基本面和情绪面，给出投资建议。

分析维度：
1. 技术面 (Technical): RSI, MACD, 均线, 布林带, 支撑阻力
2. 基本面 (Fundamental): P/E, P/B, 行业估值
3. 情绪面 (Sentiment): 宏观环境, VIX, 新闻

输出格式 (JSON):
{
  "recommendation": "HOLD|BUY|SELL",
  "confidence": 0-100,
  "composite_score": 0-100,
  "technical_score": 0-100,
  "fundamental_score": 0-100,
  "sentiment_score": 0-100,
  "cycle_predictions": {
    "24h": {"direction": "bullish|bearish|neutral", "strength": 0-100},
    "3d": {"direction": "bullish|bearish|neutral", "strength": 0-100},
    "1w": {"direction": "bullish|bearish|neutral", "strength": 0-100},
    "1m": {"direction": "volatile|neutral|bullish|bearish", "strength": 0-100}
  },
  "technical_details": {
    "rsi": number,
    "macd_signal": "golden_cross|death_cross|neutral",
    "trend": "up|down|neutral",
    "summary": "技术面分析总结"
  },
  "fundamental_details": {
    "pe": number,
    "pb": number,
    "summary": "基本面分析总结"
  },
  "sentiment_details": {
    "macro": "description",
    "vix": number,
    "news_summary": "news description",
    "summary": "情绪面分析总结"
  },
  "risk_warnings": ["risk1", "risk2"],
  "core_reasons": ["reason1", "reason2"],
  "report": "完整的中文分析报告文本"
}

重要：
- 只输出 JSON，不要 markdown 代码块
- recommendation 只能是 HOLD, BUY, SELL 之一
- confidence 反映对 recommendation 的信心程度
- 分析周期预测时要考虑当前趋势的一致性"""

class PromptBuilder:
    """构建 LLM 分析 prompt"""

    def build(self, symbol: str, name: str, stock_data: Dict, macro_data: Dict, technical_result: Dict) -> tuple:
        """构建发送给 LLM 的 messages"""
        latest = stock_data.get("latest", {})
        price = latest.get("close", 0)
        pct_change = latest.get("pct_change", 0)

        user_prompt = f"""分析股票: {symbol} ({name})
当前价格: {price}, 涨跌幅: {pct_change}%

技术指标数据:
{self._format_technical(technical_result)}

宏观数据:
{self._format_macro(macro_data)}

请给出完整的投资分析。"""

        return SYSTEM_PROMPT, user_prompt

    def _format_technical(self, data: Dict) -> str:
        if not data:
            return "数据不足"
        macd = data.get("macd", {})
        ma = data.get("moving_averages", {})
        bb = data.get("bollinger_bands", {})
        return f"""RSI(14): {data.get("rsi")}
MACD: DIF={macd.get('dif')}, DEA={macd.get('dea')}, 信号={macd.get('signal')}
均线: MA5={ma.get('ma5')}, MA10={ma.get('ma10')}, MA20={ma.get('ma20')}, MA60={ma.get('ma60')}
布林带: 上轨={bb.get('upper')}, 中轨={bb.get('middle')}, 下轨={bb.get('lower')}, 带宽={data.get('bollinger_bands', {}).get('width_pct')}%
ATR: {data.get('atr')}
支撑位: {data.get('support_level')}, 阻力位: {data.get('resistance_level')}
20日区间位置: {data.get('range_position_20d')}%
成交量比: {data.get('volume_ratio')}"""

    def _format_macro(self, data: Dict) -> str:
        dxy = data.get("dxy", "N/A")
        vix = data.get("vix", "N/A")
        bond = data.get("us_bond_10y", "N/A")
        return f"""美元指数(DXY): {dxy}
VIX恐慌指数: {vix}
美债10年收益率: {bond}%"""
```

---

### Task 6: 实现 report_generator.py - 解析 LLM 响应

**Files:**
- Create: `app/services/analysis/report_generator.py`

```python
import json
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class ReportGenerator:
    """解析 LLM 响应，生成结构化分析报告"""

    def parse(self, llm_response: str) -> Dict[str, Any]:
        """解析 LLM 返回的 JSON 文本"""
        try:
            # 清理可能存在的 markdown 代码块
            text = llm_response.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1]
                text = text.rsplit("```", 1)[0]

            return json.loads(text)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response: {e}")
            # 尝试从文本中提取 JSON
            start = llm_response.find("{")
            end = llm_response.rfind("}") + 1
            if start >= 0 and end > start:
                try:
                    return json.loads(llm_response[start:end])
                except:
                    pass
            raise ValueError(f"Invalid LLM response format")

    def validate(self, parsed: Dict) -> bool:
        """验证解析结果的完整性"""
        required = ["recommendation", "confidence", "composite_score", "technical_score", "fundamental_score", "sentiment_score"]
        for field in required:
            if field not in parsed:
                return False
        return True

    def extract_cycle_consistency(self, cycle_predictions: Dict) -> int:
        """计算周期预测一致性 (0-100)"""
        if not cycle_predictions:
            return 0
        directions = [p.get("direction") for p in cycle_predictions.values()]
        if not directions:
            return 0
        # 统计出现最多的方向
        from collections import Counter
        counts = Counter(directions)
        most_common = counts.most_common(1)[0][1]
        return round(most_common / len(directions) * 100)
```

---

### Task 7: 实现 service.py - 主分析服务

**Files:**
- Create: `app/services/analysis/service.py`

```python
import asyncio
import logging
from datetime import datetime
from typing import Optional
from app.core.db import SessionLocal
from app.models.analysis import AnalysisReport, AnalysisStatus
from app.services.llm import LLMService
from app.services.analysis.macro_fetcher import MacroFetcher
from app.services.analysis.technical import TechnicalAnalyzer
from app.services.analysis.prompt_builder import PromptBuilder
from app.services.analysis.report_generator import ReportGenerator

logger = logging.getLogger(__name__)

class AnalysisService:
    """AI 分析服务 - 管理异步分析任务"""

    def __init__(self):
        self.llm_service = LLMService()
        self.macro_fetcher = MacroFetcher()
        self.technical_analyzer = TechnicalAnalyzer()
        self.prompt_builder = PromptBuilder()
        self.report_generator = ReportGenerator()

    def create_analysis(self, symbol: str, name: str = None) -> str:
        """
        创建新的分析任务，返回 job_id
        """
        db = SessionLocal()
        try:
            report = AnalysisReport(
                symbol=symbol,
                name=name or symbol,
                status=AnalysisStatus.PENDING
            )
            db.add(report)
            db.commit()
            # 触发异步分析
            asyncio.create_task(self._run_analysis(report.id))
            return report.job_id
        finally:
            db.close()

    async def _run_analysis(self, report_id: int):
        """后台执行分析任务"""
        db = SessionLocal()
        try:
            report = db.query(AnalysisReport).filter(AnalysisReport.id == report_id).first()
            if not report:
                return

            report.status = AnalysisStatus.PROCESSING
            db.commit()

            # 1. 获取股票数据
            from app.models.stock import StockDaily
            stock_data_list = db.query(StockDaily).filter(
                StockDaily.symbol == report.symbol
            ).order_by(StockDaily.trade_date.desc()).limit(100).all()

            if not stock_data_list:
                report.status = AnalysisStatus.FAILED
                db.commit()
                return

            # 2. 计算技术指标
            technical_result = self.technical_analyzer.analyze(stock_data_list)

            # 3. 获取宏观数据
            macro_data = self.macro_fetcher.fetch_all()

            # 4. 构建 prompt
            stock_data_for_prompt = {
                "symbol": report.symbol,
                "latest": {
                    "close": stock_data_list[0].close if stock_data_list else 0,
                    "pct_change": stock_data_list[0].pct_change if stock_data_list else 0
                }
            }
            system_prompt, user_prompt = self.prompt_builder.build(
                report.symbol, report.name or report.symbol,
                stock_data_for_prompt, macro_data, technical_result
            )

            # 5. 调用 LLM
            llm_response = self.llm_service.call_llm_api(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                model=None,  # 使用默认模型
                temperature=0.3,
                use_json_mode=True
            )

            # 6. 解析 LLM 响应
            parsed = self.report_generator.parse(llm_response)

            # 7. 更新报告
            report.recommendation = parsed.get("recommendation", "HOLD")
            report.confidence = parsed.get("confidence", 50)
            report.composite_score = parsed.get("composite_score", 50)
            report.technical_score = parsed.get("technical_score", 50)
            report.fundamental_score = parsed.get("fundamental_score", 50)
            report.sentiment_score = parsed.get("sentiment_score", 50)
            report.cycle_predictions = parsed.get("cycle_predictions", {})
            report.technical_details = parsed.get("technical_details", {})
            report.fundamental_details = parsed.get("fundamental_details", {})
            report.sentiment_details = parsed.get("sentiment_details", {})
            report.risk_warnings = parsed.get("risk_warnings", [])
            report.report = parsed.get("report", "")

            # 设置支撑阻力
            if technical_result:
                report.support_level = technical_result.get("support_level")
                report.resistance_level = technical_result.get("resistance_level")

            report.status = AnalysisStatus.COMPLETED
            report.updated_at = datetime.utcnow()
            db.commit()

        except Exception as e:
            logger.error(f"Analysis failed for report {report_id}: {e}")
            report.status = AnalysisStatus.FAILED
            db.commit()
        finally:
            db.close()

    def get_status(self, job_id: str) -> Optional[Dict]:
        """获取分析任务状态"""
        db = SessionLocal()
        try:
            report = db.query(AnalysisReport).filter(AnalysisReport.job_id == job_id).first()
            if not report:
                return None
            return {
                "job_id": report.job_id,
                "status": report.status.value,
                "symbol": report.symbol
            }
        finally:
            db.close()

    def get_latest(self, symbol: str) -> Optional[AnalysisReport]:
        """获取最新的分析结果"""
        db = SessionLocal()
        try:
            return db.query(AnalysisReport).filter(
                AnalysisReport.symbol == symbol,
                AnalysisReport.status == AnalysisStatus.COMPLETED
            ).order_by(AnalysisReport.created_at.desc()).first()
        finally:
            db.close()


analysis_service = AnalysisService()
```

---

### Task 8: 实现 API 端点

**Files:**
- Create: `app/api/endpoints/analysis.py`

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.core.db import get_db
from app.models.analysis import AnalysisReport, AnalysisStatus
from app.services.analysis.service import analysis_service
from pydantic import BaseModel

router = APIRouter()

class AnalysisResponse(BaseModel):
    job_id: str
    status: str
    symbol: str

class AnalysisResultResponse(BaseModel):
    id: int
    symbol: str
    name: str
    recommendation: str
    confidence: float
    composite_score: int
    technical_score: int
    fundamental_score: int
    sentiment_score: int
    cycle_predictions: dict
    technical_details: dict
    fundamental_details: dict
    sentiment_details: dict
    support_level: float
    resistance_level: float
    risk_warnings: list
    report: str
    created_at: str

    class Config:
        from_attributes = True

@router.post("/{symbol}", response_model=AnalysisResponse)
def start_analysis(symbol: str, name: Optional[str] = None, db: Session = Depends(get_db)):
    """发起新的股票分析，返回 job_id"""
    job_id = analysis_service.create_analysis(symbol, name)
    return AnalysisResponse(job_id=job_id, status="pending", symbol=symbol)

@router.get("/status/{job_id}")
def get_analysis_status(job_id: str):
    """轮询分析状态"""
    result = analysis_service.get_status(job_id)
    if not result:
        raise HTTPException(status_code=404, detail="Job not found")
    return result

@router.get("/{symbol}", response_model=AnalysisResultResponse)
def get_latest_analysis(symbol: str, db: Session = Depends(get_db)):
    """获取最新分析结果"""
    report = analysis_service.get_latest(symbol)
    if not report:
        raise HTTPException(status_code=404, detail="No analysis found")
    return AnalysisResultResponse(
        id=report.id,
        symbol=report.symbol,
        name=report.name or report.symbol,
        recommendation=report.recommendation or "HOLD",
        confidence=report.confidence or 50,
        composite_score=report.composite_score or 50,
        technical_score=report.technical_score or 50,
        fundamental_score=report.fundamental_score or 50,
        sentiment_score=report.sentiment_score or 50,
        cycle_predictions=report.cycle_predictions or {},
        technical_details=report.technical_details or {},
        fundamental_details=report.fundamental_details or {},
        sentiment_details=report.sentiment_details or {},
        support_level=report.support_level or 0,
        resistance_level=report.resistance_level or 0,
        risk_warnings=report.risk_warnings or [],
        report=report.report or "",
        created_at=report.created_at.isoformat() if report.created_at else ""
    )

@router.delete("/{symbol}")
def delete_analysis(symbol: str, db: Session = Depends(get_db)):
    """删除分析记录"""
    report = db.query(AnalysisReport).filter(AnalysisReport.symbol == symbol).first()
    if report:
        db.delete(report)
        db.commit()
    return {"message": "deleted"}
```

---

### Task 9: 更新 main.py 注册 analysis router

**Files:**
- Modify: `app/main.py`

在 `app/main.py` 中添加:
```python
from app.api.endpoints import market, strategy, auth, users, usage, config, tasks, analysis
```

并添加:
```python
app.include_router(analysis.router, prefix=f"{settings.API_V1_STR}/analysis", tags=["analysis"])
```

---

### Task 10: 创建 AnalysisPanel.tsx 前端组件

**Files:**
- Create: `frontend/src/components/AnalysisPanel.tsx`

**功能:**
- 股票搜索选择器 (Autocomplete)
- "开始分析" 按钮
- 分析状态轮询 (pending/processing/completed/failed)
- 结果展示:
  - 核心建议卡片 (HOLD/BUY/SELL + 置信度)
  - 四维评分 (技术面/基本面/情绪面/综合)
  - 周期预测 (24h/3d/1w/1m)
  - 技术指标详情 (RSI/MACD/布林带/均线/支撑阻力)
  - 风险提示
  - K线图 (使用 stockData)

---

### Task 11: 更新 dashboard.tsx

**Files:**
- Modify: `frontend/src/pages/dashboard.tsx`

将"行情监控视图"的 Card 组件（包含 K 线图和数据获取）替换为 `<AnalysisPanel />` 组件

---

## 验证检查

- [ ] 分析服务能正确创建 AnalysisReport
- [ ] 异步任务能正确执行并更新状态
- [ ] API 端点返回正确格式
- [ ] 前端能轮询状态并展示结果
- [ ] K 线图能正确渲染