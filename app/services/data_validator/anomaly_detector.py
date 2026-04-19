import numpy as np
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
from datetime import datetime, date
import statistics

from app.models.data_quality import AnomalyType


@dataclass
class AnomalyRecord:
    """Record of detected anomaly"""
    symbol: str
    trade_date: date
    anomaly_type: AnomalyType
    field_name: str
    value: float
    z_score: float
    threshold: float
    message: str


class AnomalyDetector:
    """
    Statistical anomaly detection for stock data.
    Uses rolling Z-score to detect outliers.
    """

    # Default parameters
    DEFAULT_WINDOW_SIZE: int = 20       # Rolling window size for Z-score
    DEFAULT_Z_THRESHOLD: float = 3.0    # Z-score threshold for anomaly

    def __init__(
        self,
        window_size: int = None,
        z_threshold: float = None,
        min_periods: int = 5
    ):
        self.window_size = window_size or self.DEFAULT_WINDOW_SIZE
        self.z_threshold = z_threshold or self.DEFAULT_Z_THRESHOLD
        self.min_periods = min_periods

    def detect_outliers(
        self,
        data: List[Dict],
        field_name: str = "close",
        symbol: str = None
    ) -> List[AnomalyRecord]:
        """
        Detect statistical outliers in a time series.
        Uses rolling Z-score method.

        Args:
            data: List of dictionaries with stock data, sorted by date (oldest first)
            field_name: Field to analyze (default: close price)
            symbol: Stock symbol for record keeping

        Returns:
            List of AnomalyRecord for detected outliers
        """
        if len(data) < self.min_periods:
            return []

        anomalies = []

        # Extract values
        values = []
        dates = []
        for record in data:
            value = record.get(field_name)
            trade_date = record.get("trade_date")
            if value is not None and trade_date is not None:
                values.append(value)
                dates.append(trade_date)

        if len(values) < self.min_periods:
            return []

        # Calculate rolling Z-scores
        z_scores = self._calculate_rolling_zscore(values)

        # Detect anomalies
        for i, (z_score, value) in enumerate(zip(z_scores, values)):
            if abs(z_score) > self.z_threshold:
                anomalies.append(AnomalyRecord(
                    symbol=symbol or "",
                    trade_date=dates[i],
                    anomaly_type=AnomalyType.OUTLIER,
                    field_name=field_name,
                    value=value,
                    z_score=z_score,
                    threshold=self.z_threshold,
                    message=f"Outlier detected: {field_name}={value}, Z-score={z_score:.2f}"
                ))

        return anomalies

    def _calculate_rolling_zscore(self, values: List[float]) -> List[float]:
        """Calculate rolling Z-score for a list of values"""
        z_scores = []

        for i in range(len(values)):
            if i < self.min_periods - 1:
                z_scores.append(0.0)  # Not enough data
                continue

            # Get window
            start_idx = max(0, i - self.window_size + 1)
            window = values[start_idx:i + 1]

            if len(window) < self.min_periods:
                z_scores.append(0.0)
                continue

            # Calculate mean and std
            mean = statistics.mean(window[:-1])  # Exclude current point
            std = statistics.stdev(window[:-1]) if len(window) > 1 else 1.0

            if std == 0:
                z_scores.append(0.0)
                continue

            # Calculate Z-score
            z_score = (values[i] - mean) / std
            z_scores.append(z_score)

        return z_scores

    def detect_price_jumps(
        self,
        data: List[Dict],
        symbol: str = None,
        threshold_pct: float = 10.0
    ) -> List[AnomalyRecord]:
        """
        Detect sudden price jumps that may indicate data errors.

        Args:
            data: List of dictionaries with stock data
            symbol: Stock symbol
            threshold_pct: Percentage change threshold for jump detection

        Returns:
            List of AnomalyRecord for detected jumps
        """
        anomalies = []

        for i in range(1, len(data)):
            prev_close = data[i - 1].get("close")
            curr_close = data[i].get("close")
            curr_date = data[i].get("trade_date")

            if prev_close is None or curr_close is None or prev_close == 0:
                continue

            pct_change = abs((curr_close - prev_close) / prev_close * 100)

            if pct_change > threshold_pct:
                anomalies.append(AnomalyRecord(
                    symbol=symbol or "",
                    trade_date=curr_date,
                    anomaly_type=AnomalyType.EXCESSIVE_CHANGE,
                    field_name="close",
                    value=curr_close,
                    z_score=pct_change / 100,  # Use pct as simplified z-score
                    threshold=threshold_pct / 100,
                    message=f"Price jump detected: {pct_change:.2f}% change on {curr_date}"
                ))

        return anomalies

    def detect_volume_anomalies(
        self,
        data: List[Dict],
        symbol: str = None,
        volume_field: str = "volume",
        threshold_multiplier: float = 5.0
    ) -> List[AnomalyRecord]:
        """
        Detect unusual volume patterns.

        Args:
            data: List of dictionaries with stock data
            symbol: Stock symbol
            volume_field: Field name for volume
            threshold_multiplier: Volume must be this many times above average to be anomaly

        Returns:
            List of AnomalyRecord for detected volume anomalies
        """
        anomalies = []

        if len(data) < self.min_periods:
            return []

        # Calculate average volume (excluding current)
        volumes = []
        for record in data:
            vol = record.get(volume_field)
            if vol is not None and vol > 0:
                volumes.append(vol)

        if len(volumes) < self.min_periods:
            return []

        avg_volume = statistics.mean(volumes[:-1])  # Exclude current

        # Check last record
        if len(data) > 0:
            last_vol = data[-1].get(volume_field)
            last_date = data[-1].get("trade_date")

            if last_vol is not None and avg_volume > 0:
                ratio = last_vol / avg_volume
                if ratio > threshold_multiplier:
                    anomalies.append(AnomalyRecord(
                        symbol=symbol or "",
                        trade_date=last_date,
                        anomaly_type=AnomalyType.ZERO_VOLUME,  # Reusing this type for volume anomalies
                        field_name=volume_field,
                        value=last_vol,
                        z_score=ratio,
                        threshold=threshold_multiplier,
                        message=f"Unusual volume detected: {last_vol} ({ratio:.1f}x average)"
                    ))

        return anomalies

    def batch_detect(
        self,
        stock_data_map: Dict[str, List[Dict]],
        methods: List[str] = None
    ) -> Dict[str, List[AnomalyRecord]]:
        """
        Run anomaly detection on multiple stocks.

        Args:
            stock_data_map: Dict mapping symbol to list of data records
            methods: List of detection methods to run ["outliers", "price_jumps", "volume"]

        Returns:
            Dict mapping symbol to list of detected anomalies
        """
        if methods is None:
            methods = ["outliers", "price_jumps"]

        results = {}

        for symbol, data in stock_data_map.items():
            anomalies = []

            if "outliers" in methods:
                anomalies.extend(self.detect_outliers(data, "close", symbol))
                anomalies.extend(self.detect_outliers(data, "volume", symbol))

            if "price_jumps" in methods:
                anomalies.extend(self.detect_price_jumps(data, symbol))

            if "volume" in methods:
                anomalies.extend(self.detect_volume_anomalies(data, symbol))

            if anomalies:
                results[symbol] = anomalies

        return results
