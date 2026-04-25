"""LLM prompt builder for stock analysis."""
from typing import Dict, Any, Tuple

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
    """Builds LLM prompts for stock analysis."""

    def build(self, symbol: str, name: str, stock_data: Dict, macro_data: Dict, technical_result: Dict) -> Tuple[str, str]:
        """
        Build system and user prompts for LLM.

        Returns:
            Tuple of (system_prompt, user_prompt)
        """
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
        """Format technical data for prompt."""
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
        """Format macro data for prompt."""
        dxy = data.get("dxy", "N/A")
        vix = data.get("vix", "N/A")
        bond = data.get("us_bond_10y", "N/A")
        return f"""美元指数(DXY): {dxy}
VIX恐慌指数: {vix}
美债10年收益率: {bond}%"""