"""Technical indicator calculations: RSI, MACD, Bollinger Bands, Moving Averages, ATR."""
import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple

class TechnicalAnalyzer:
    """Calculates technical indicators for stock analysis."""

    def calculate_rsi(self, prices: pd.Series, period: int = 14) -> float:
        """Calculate RSI (Relative Strength Index)."""
        delta = prices.diff()
        gain = delta.where(delta > 0, 0).rolling(period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(period).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        return round(rsi.iloc[-1], 2) if not pd.isna(rsi.iloc[-1]) else 50.0

    def calculate_macd(self, prices: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> Tuple[float, float, float]:
        """Calculate MACD (DIF, DEA, HIST)."""
        ema_fast = prices.ewm(span=fast).mean()
        ema_slow = prices.ewm(span=slow).mean()
        dif = ema_fast - ema_slow
        dea = dif.ewm(span=signal).mean()
        hist = (dif - dea) * 2
        return round(dif.iloc[-1], 4), round(dea.iloc[-1], 4), round(hist.iloc[-1], 4)

    def calculate_bollinger_bands(self, prices: pd.Series, period: int = 20, std_dev: int = 2) -> Tuple[float, float, float]:
        """Calculate Bollinger Bands (upper, middle, lower)."""
        ma = prices.rolling(period).mean()
        std = prices.rolling(period).std()
        upper = ma + (std * std_dev)
        lower = ma - (std * std_dev)
        return round(upper.iloc[-1], 2), round(ma.iloc[-1], 2), round(lower.iloc[-1], 2)

    def calculate_ma(self, prices: pd.Series, periods: List[int] = [5, 10, 20, 60]) -> Dict[str, Optional[float]]:
        """Calculate Moving Averages."""
        result = {}
        for p in periods:
            ma = prices.rolling(p).mean()
            result[f"ma{p}"] = round(ma.iloc[-1], 2) if not pd.isna(ma.iloc[-1]) else None
        return result

    def calculate_atr(self, high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> Optional[float]:
        """Calculate ATR (Average True Range)."""
        tr = pd.concat([
            high - low,
            (high - close.shift()).abs(),
            (low - close.shift()).abs()
        ], axis=1).max(axis=1)
        atr = tr.rolling(period).mean()
        return round(atr.iloc[-1], 4) if not pd.isna(atr.iloc[-1]) else None

    def find_support_resistance(self, prices: pd.Series, lookback: int = 20) -> Tuple[Optional[float], Optional[float]]:
        """Find support and resistance levels (based on recent high/low)."""
        recent = prices.iloc[-lookback:]
        support = round(recent.min(), 2)
        resistance = round(recent.max(), 2)
        return support, resistance

    def analyze(self, stock_data: List) -> Dict:
        """
        Perform comprehensive technical analysis.

        Args:
            stock_data: List of dict with 'open', 'high', 'low', 'close', 'volume' keys,
                       or list of StockDaily objects.

        Returns:
            Dict with technical indicators.
        """
        if not stock_data:
            return {}

        # Handle both dict and StockDaily objects
        if isinstance(stock_data[0], dict):
            df = pd.DataFrame(stock_data)
        else:
            # Assume StockDaily objects with attributes
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

        # Calculate all indicators
        rsi = self.calculate_rsi(prices)
        macd_dif, macd_dea, macd_hist = self.calculate_macd(prices)
        bb_upper, bb_middle, bb_lower = self.calculate_bollinger_bands(prices)
        ma_dict = self.calculate_ma(prices)
        atr = self.calculate_atr(high, low, prices)
        support, resistance = self.find_support_resistance(prices)

        # Calculate 20-day range position
        range_position = ((prices.iloc[-1] - low.min()) / (high.max() - low.min()) * 100) if high.max() > low.min() else 50.0

        # Calculate volume ratio (current volume / 20-day average)
        vol_avg = df["volume"].rolling(20).mean().iloc[-1] if len(df) >= 20 else df["volume"].mean()
        vol_ratio = round(df["volume"].iloc[-1] / vol_avg, 2) if vol_avg and vol_avg > 0 else 1.0

        # Bollinger Band width percentage
        bb_width = round((bb_upper - bb_lower) / bb_middle * 100, 2) if bb_middle else 0.0

        # Determine trend
        trend = "neutral"
        if ma_dict.get("ma5") and ma_dict.get("ma20"):
            if ma_dict["ma5"] > ma_dict["ma20"] * 1.01:
                trend = "up"
            elif ma_dict["ma5"] < ma_dict["ma20"] * 0.99:
                trend = "down"

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
            "trend": trend
        }