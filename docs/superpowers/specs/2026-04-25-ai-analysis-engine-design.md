# AI 智能分析引擎 - 设计文档

**日期**: 2026-04-25
**状态**: 已批准

---

## 1. 概述

在 KLineAI Dashboard 的"行情监控视图"位置实现 AI 智能分析引擎，替换原有 K 线图+数据获取界面。提供股票多维分析（技术面、基本面、情绪面、综合评分），支持异步分析和历史记录。

---

## 2. 前端设计

### 2.1 组件结构

```
AnalysisPanel (主组件)
├── Header: 股票选择 + 开始分析按钮
├── StatusArea: 分析状态轮询 (loading/progress)
├── ResultPanel (分析结果)
│   ├── SummaryCard: 核心建议(HOLD/BUY/SELL) + 置信度
│   ├── CyclePrediction: 24h/3d/1w/1m 周期预测
│   ├── FourDimScore: 四维评分 (技术面/基本面/情绪面/综合)
│   ├── TechnicalDetails: RSI/MACD/均线/布林带等
│   ├── FundamentalDetails: P/E/P/B 等
│   ├── SentimentDetails: 宏观环境/VIX/新闻等
│   ├── SupportResistance: 支撑位/阻力位
│   ├── RiskWarnings: 风险提示
│   └── KLineChart: K线图 (ECharts)
└── HistoryButton: 查看历史分析
```

### 2.2 交互流程

1. 用户选择股票 → 点击"开始分析"
2. API 立即返回 `job_id`，前端开始轮询 `/analysis/status/{job_id}`
3. 状态 `pending` → `processing` → `completed`/`failed`
4. 完成后展示完整分析结果

---

## 3. 后端设计

### 3.1 API 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/analysis/{symbol}` | 发起分析，返回 job_id |
| GET | `/analysis/status/{job_id}` | 轮询分析状态 |
| GET | `/analysis/{symbol}` | 获取最新分析结果 |
| DELETE | `/analysis/{symbol}` | 删除分析记录 |

### 3.2 数据模型

**AnalysisReport (标的级)**

| 字段 | 类型 | 描述 |
|------|------|------|
| id | int | 主键 |
| symbol | string | 股票代码 |
| name | string | 股票名称 |
| job_id | string | 异步任务ID |
| status | enum | pending/processing/completed/failed |
| recommendation | string | HOLD/BUY/SELL |
| confidence | float | 置信度 0-100 |
| composite_score | int | 综合评分 0-100 |
| technical_score | int | 技术面评分 |
| fundamental_score | int | 基本面评分 |
| sentiment_score | int | 情绪面评分 |
| cycle_predictions | json | 周期预测 |
| technical_details | json | 技术指标详情 |
| fundamental_details | json | 基本面详情 |
| sentiment_details | json | 情绪详情 |
| support_level | float | 支撑位 |
| resistance_level | float | 阻力位 |
| risk_warnings | json | 风险提示 |
| report | text | AI 生成的完整分析文本 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 3.3 分析服务模块

```
services/analysis/
├── __init__.py
├── service.py          # 主分析服务，异步任务管理
├── macro_fetcher.py    # 宏观数据获取 (DXY/VIX/美债/新闻)
├── technical.py        # 技术指标计算 (RSI/MACD/布林带/均线)
├── prompt_builder.py   # 构建 LLM prompt
└── report_generator.py # 解析 LLM 响应，生成分析报告
```

### 3.4 异步任务流程

1. POST `/analysis/{symbol}` → 创建 `AnalysisReport(status=pending)` → 返回 `job_id`
2. 后台任务：
   - 获取 stock_daily 数据（计算技术指标）
   - 获取宏观数据（DXY/VIX/新闻）
   - 构建 prompt → 调用 LLM 服务
   - 解析 LLM 响应 → 更新 `AnalysisReport`
3. 前端轮询 `GET /analysis/status/{job_id}`

---

## 4. 实现顺序 (Phase)

| Phase | 文件 | 描述 |
|-------|------|------|
| 1 | app/services/llm/ | 已存在，无需修改 |
| 2 | app/services/llm_service.py | 已存在，无需修改 |
| 3 | app/models/analysis.py | 新建 AnalysisReport 模型 |
| 4 | app/services/analysis/ | 新建 5 个分析服务文件 |
| 5 | app/api/endpoints/analysis.py | 新建分析 API 端点 |
| 6 | frontend/src/components/AnalysisPanel.tsx + dashboard.tsx | 新建前端组件 |

---

## 5. 依赖

- **LLM 服务**: 使用现有的 `app.services.llm.LLMService`
- **数据库**: 使用现有的 SQLAlchemy + PostgreSQL
- **外部数据**: AKShare (DXY, VIX, 新闻)
- **前端**: React + TypeScript + MUI + ECharts