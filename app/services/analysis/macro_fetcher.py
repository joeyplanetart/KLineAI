"""Macro data fetcher: DXY, VIX, US bond yields."""
import akshare as ak
from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)

class MacroFetcher:
    """Fetches macro market data: DXY, VIX, US bond yields, news sentiment."""

    def get_dxy_index(self) -> Optional[float]:
        """Get US Dollar Index (DXY)."""
        try:
            df = ak.currency_hist("USD/XR")
            if df is not None and not df.empty:
                return float(df.iloc[-1]["close"])
        except Exception as e:
            logger.warning(f"Failed to get DXY: {e}")
        return None

    def get_vix_index(self) -> Optional[float]:
        """Get VIX fear index."""
        try:
            df = ak.vix_index()
            if df is not None and not df.empty:
                return float(df.iloc[-1]["close"])
        except Exception as e:
            logger.warning(f"Failed to get VIX: {e}")
        return None

    def get_us_bond_yield(self, duration: str = "10") -> Optional[float]:
        """Get US Treasury bond yield (default 10-year)."""
        try:
            df = ak.us_bond_yield()
            if df is not None:
                row = df[df["duration"] == f"{duration}y"]
                if not row.empty:
                    return float(row.iloc[0]["yield"])
        except Exception as e:
            logger.warning(f"Failed to get US bond yield: {e}")
        return None

    def get_news_sentiment(self, symbol: str = None) -> Optional[Dict]:
        """Get news sentiment for a symbol or market overall."""
        # Placeholder for news sentiment - can be expanded later
        return None

    def fetch_all(self) -> Dict[str, Optional[float]]:
        """Fetch all macro data."""
        return {
            "dxy": self.get_dxy_index(),
            "vix": self.get_vix_index(),
            "us_bond_10y": self.get_us_bond_yield("10"),
        }
