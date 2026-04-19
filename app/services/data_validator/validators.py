from dataclasses import dataclass, field
from typing import List, Optional, Any
from datetime import date
from enum import Enum

from app.models.data_quality import AnomalyType


class ValidationLevel(str, Enum):
    """Validation severity level"""
    WARNING = "warning"    # Non-critical issues
    ERROR = "error"        # Critical issues that should be flagged
    BLOCK = "block"        # Issues that should prevent data storage


@dataclass
class ValidationResult:
    """Result of a validation check"""
    is_valid: bool
    anomaly_type: Optional[AnomalyType] = None
    field_name: Optional[str] = None
    actual_value: Optional[str] = None
    expected_value: Optional[str] = None
    message: str = ""
    level: ValidationLevel = ValidationLevel.ERROR
    details: dict = field(default_factory=dict)


class DataValidator:
    """
    Validates stock daily data for quality issues.
    Checks for: negative prices, OHLC consistency, excessive changes, etc.
    """

    # Configuration thresholds
    MAX_PCT_CHANGE: float = 20.0  # Maximum allowed pct_change (%)
    MAX_AMPLITUDE: float = 25.0    # Maximum allowed amplitude (%)
    MIN_PRICE: float = 0.01        # Minimum allowed price

    def __init__(self, max_pct_change: float = None, max_amplitude: float = None, min_price: float = None):
        """Initialize validator with custom thresholds"""
        if max_pct_change is not None:
            self.MAX_PCT_CHANGE = max_pct_change
        if max_amplitude is not None:
            self.MAX_AMPLITUDE = max_amplitude
        if min_price is not None:
            self.MIN_PRICE = min_price

    def validate(self, data: dict) -> List[ValidationResult]:
        """
        Validate a single stock daily record.
        Returns list of validation results (empty if all valid).
        """
        results = []

        # Check negative prices
        results.extend(self._check_negative_prices(data))

        # Check OHLC consistency
        results.extend(self._check_ohlc_consistency(data))

        # Check pct_change
        results.extend(self._check_pct_change(data))

        # Check amplitude
        results.extend(self._check_amplitude(data))

        # Check zero volume
        results.extend(self._check_zero_volume(data))

        # Check missing fields
        results.extend(self._check_missing_fields(data))

        return results

    def _check_negative_prices(self, data: dict) -> List[ValidationResult]:
        """Check for negative prices"""
        results = []
        price_fields = ["open", "close", "high", "low"]

        for field_name in price_fields:
            value = data.get(field_name)
            if value is not None and value < 0:
                results.append(ValidationResult(
                    is_valid=False,
                    anomaly_type=AnomalyType.NEGATIVE_PRICE,
                    field_name=field_name,
                    actual_value=str(value),
                    expected_value=f">= {self.MIN_PRICE}",
                    message=f"Negative price detected: {field_name}={value}",
                    level=ValidationLevel.BLOCK,
                    details={"threshold": self.MIN_PRICE}
                ))

        return results

    def _check_ohlc_consistency(self, data: dict) -> List[ValidationResult]:
        """Check OHLC consistency: high >= max(open, close) and low <= min(open, close)"""
        results = []

        open_price = data.get("open")
        close_price = data.get("close")
        high_price = data.get("high")
        low_price = data.get("low")

        # Skip if any required field is missing
        if None in [open_price, close_price, high_price, low_price]:
            return results

        max_oc = max(open_price, close_price)
        min_oc = min(open_price, close_price)

        # High should be >= max(open, close)
        if high_price < max_oc:
            results.append(ValidationResult(
                is_valid=False,
                anomaly_type=AnomalyType.INVALID_OHLC,
                field_name="high",
                actual_value=str(high_price),
                expected_value=f">= {max_oc}",
                message=f"High price ({high_price}) < max(open, close) ({max_oc})",
                level=ValidationLevel.ERROR,
                details={"open": open_price, "close": close_price, "high": high_price, "low": low_price}
            ))

        # Low should be <= min(open, close)
        if low_price > min_oc:
            results.append(ValidationResult(
                is_valid=False,
                anomaly_type=AnomalyType.INVALID_OHLC,
                field_name="low",
                actual_value=str(low_price),
                expected_value=f"<= {min_oc}",
                message=f"Low price ({low_price}) > min(open, close) ({min_oc})",
                level=ValidationLevel.ERROR,
                details={"open": open_price, "close": close_price, "high": high_price, "low": low_price}
            ))

        # High should be >= Low
        if high_price < low_price:
            results.append(ValidationResult(
                is_valid=False,
                anomaly_type=AnomalyType.INVALID_OHLC,
                field_name="high",
                actual_value=str(high_price),
                expected_value=f">= {low_price}",
                message=f"High price ({high_price}) < Low price ({low_price})",
                level=ValidationLevel.BLOCK,
                details={"high": high_price, "low": low_price}
            ))

        return results

    def _check_pct_change(self, data: dict) -> List[ValidationResult]:
        """Check if pct_change exceeds threshold"""
        results = []

        pct_change = data.get("pct_change")
        if pct_change is None:
            return results

        if abs(pct_change) > self.MAX_PCT_CHANGE:
            results.append(ValidationResult(
                is_valid=False,
                anomaly_type=AnomalyType.EXCESSIVE_CHANGE,
                field_name="pct_change",
                actual_value=str(pct_change),
                expected_value=f"|pct_change| <= {self.MAX_PCT_CHANGE}%",
                message=f"Excessive price change: {pct_change}% (threshold: {self.MAX_PCT_CHANGE}%)",
                level=ValidationLevel.WARNING,
                details={"threshold": self.MAX_PCT_CHANGE, "pct_change": pct_change}
            ))

        return results

    def _check_amplitude(self, data: dict) -> List[ValidationResult]:
        """Check if amplitude exceeds threshold"""
        results = []

        amplitude = data.get("amplitude")
        if amplitude is None:
            return results

        if amplitude > self.MAX_AMPLITUDE:
            results.append(ValidationResult(
                is_valid=False,
                anomaly_type=AnomalyType.EXCESSIVE_AMPLITUDE,
                field_name="amplitude",
                actual_value=str(amplitude),
                expected_value=f"<= {self.MAX_AMPLITUDE}%",
                message=f"Excessive amplitude: {amplitude}% (threshold: {self.MAX_AMPLITUDE}%)",
                level=ValidationLevel.WARNING,
                details={"threshold": self.MAX_AMPLITUDE, "amplitude": amplitude}
            ))

        return results

    def _check_zero_volume(self, data: dict) -> List[ValidationResult]:
        """Check for zero volume on non-holiday days"""
        results = []

        volume = data.get("volume")
        if volume is not None and volume == 0:
            # Check if it's a trading day (has price movement)
            close = data.get("close")
            pct_change = data.get("pct_change", 0)

            # If there's price movement, zero volume is suspicious
            if close and close > 0 and abs(pct_change) > 0.1:
                results.append(ValidationResult(
                    is_valid=False,
                    anomaly_type=AnomalyType.ZERO_VOLUME,
                    field_name="volume",
                    actual_value="0",
                    expected_value="> 0",
                    message="Zero volume detected despite price movement",
                    level=ValidationLevel.WARNING,
                    details={"close": close, "pct_change": pct_change}
                ))

        return results

    def _check_missing_fields(self, data: dict) -> List[ValidationResult]:
        """Check for required fields with missing values"""
        results = []

        required_fields = ["symbol", "trade_date", "open", "close", "high", "low"]

        for field_name in required_fields:
            value = data.get(field_name)
            if value is None or (isinstance(value, str) and value.strip() == ""):
                results.append(ValidationResult(
                    is_valid=False,
                    anomaly_type=AnomalyType.MISSING_FIELD,
                    field_name=field_name,
                    actual_value=str(value),
                    expected_value="non-null value",
                    message=f"Missing required field: {field_name}",
                    level=ValidationLevel.BLOCK,
                    details={}
                ))

        return results

    def is_data_valid(self, data: dict) -> bool:
        """Quick check if data passes all validations"""
        results = self.validate(data)
        return all(r.is_valid for r in results)

    def get_critical_errors(self, data: dict) -> List[ValidationResult]:
        """Get only BLOCK level errors"""
        results = self.validate(data)
        return [r for r in results if r.level == ValidationLevel.BLOCK and not r.is_valid]
