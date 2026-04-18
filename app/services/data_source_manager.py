"""
数据源管理器
支持 AKShare（默认）和 Tushare
"""
import akshare as ak
import pandas as pd
from abc import ABC, abstractmethod
from typing import Optional
from app.core.config import settings


class BaseDataSource(ABC):
    """数据源抽象基类"""

    @abstractmethod
    def get_name(self) -> str:
        pass

    @abstractmethod
    def fetch_daily(
        self,
        symbol: str,
        start_date: str,
        end_date: str
    ) -> pd.DataFrame:
        """
        获取日K线数据
        返回 DataFrame，列名：date, open, high, low, close, volume
        """
        pass

    def is_available(self) -> bool:
        """检查数据源是否可用"""
        try:
            return True
        except Exception:
            return False


class AKShareDataSource(BaseDataSource):
    """AKShare 数据源 - 默认免费数据源"""

    def get_name(self) -> str:
        return "AKShare"

    def is_available(self) -> bool:
        """AKShare 总是可用，实际连接在 fetch_daily 时测试"""
        return True

    def fetch_daily(
        self,
        symbol: str,
        start_date: str,
        end_date: str
    ) -> pd.DataFrame:
        """
        使用 AKShare 获取 A 股日K线数据
        symbol: 如 'sh600000', 'sz000001'
        """
        try:
            # 使用腾讯接口获取数据（东方财富接口不稳定）
            df = ak.stock_zh_a_hist_tx(
                symbol=symbol,
                start_date=start_date,
                end_date=end_date
            )

            if df is None or df.empty:
                return pd.DataFrame()

            # 标准化列名
            df = df.rename(columns={
                "date": "date",
                "open": "open",
                "close": "close",
                "high": "high",
                "low": "low",
                "volume": "volume",
                "amount": "amount",
            })

            return df
        except Exception as e:
            raise ConnectionError(f"AKShare failed: {str(e)}") from e


class TushareDataSource(BaseDataSource):
    """Tushare 数据源 - 需要 token"""

    def __init__(self, token: Optional[str] = None):
        self.token = token or settings.TUSHARE_TOKEN
        self.api = None

    def get_name(self) -> str:
        return "Tushare"

    def is_available(self) -> bool:
        """检查 Tushare Token 是否配置"""
        return bool(self.token)

    def fetch_daily(
        self,
        symbol: str,
        start_date: str,
        end_date: str
    ) -> pd.DataFrame:
        """
        使用 Tushare 获取 A 股日K线数据
        symbol: 如 '600000' (上海), '000001' (深圳)
        """
        if not self.token:
            raise ConnectionError("Tushare token not configured")

        try:
            import tushare as ts

            if self.api is None:
                self.api = ts.pro(self.token)

            # 转换symbol格式
            ts_code = symbol
            if symbol.startswith('sh'):
                ts_code = symbol[2:] + '.SH'
            elif symbol.startswith('sz'):
                ts_code = symbol[2:] + '.SZ'

            df = self.api.daily(
                ts_code=ts_code,
                start_date=start_date,
                end_date=end_date
            )

            if df is None or df.empty:
                return pd.DataFrame()

            # 标准化列名
            df = df.rename(columns={
                "trade_date": "date",
                "vol": "volume",
            })

            return df
        except Exception as e:
            raise ConnectionError(f"Tushare failed: {str(e)}") from e


class DataSourceManager:
    """
    数据源管理器
    自动检测可用性，优先使用 AKShare
    """

    def __init__(self):
        self.akshare = AKShareDataSource()
        self.tushare = TushareDataSource()
        self._current_source: Optional[BaseDataSource] = None
        self._preferred_source = "akshare"  # 用户偏好

    @property
    def current_source(self) -> BaseDataSource:
        """获取当前数据源"""
        if self._current_source:
            return self._current_source

        # 尝试使用偏好的数据源
        if self._preferred_source == "akshare":
            self._current_source = self.akshare
        elif self._preferred_source == "tushare" and self.tushare.is_available():
            self._current_source = self.tushare
        else:
            # 默认使用 AKShare
            self._current_source = self.akshare

        return self._current_source

    def set_preferred_source(self, source: str):
        """设置偏好数据源"""
        self._preferred_source = source
        self._current_source = None  # 重置

    def get_available_sources(self) -> list:
        """获取所有可用的数据源"""
        sources = []
        sources.append({
            "name": "AKShare",
            "id": "akshare",
            "available": self.akshare.is_available(),
            "description": "免费开源数据源（默认）"
        })
        sources.append({
            "name": "Tushare",
            "id": "tushare",
            "available": self.tushare.is_available(),
            "description": "需要 TUSHARE_TOKEN"
        })
        return sources

    def fetch_daily(
        self,
        symbol: str,
        start_date: str,
        end_date: str
    ) -> pd.DataFrame:
        """使用当前数据源获取数据"""
        return self.current_source.fetch_daily(symbol, start_date, end_date)


# 全局单例
data_source_manager = DataSourceManager()
