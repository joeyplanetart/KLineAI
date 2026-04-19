"""
数据源管理器
支持 AKShare（默认）、Tushare 和 BaoStock
"""
import akshare as ak
import baostock as bs
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


class BaoStockDataSource(BaseDataSource):
    """BaoStock 数据源 - 免费无需Token"""

    def __init__(self):
        self._logged_in = False

    def get_name(self) -> str:
        return "BaoStock"

    def is_available(self) -> bool:
        """BaoStock 总是可用"""
        return True

    def _ensure_login(self):
        """确保已登录"""
        if not self._logged_in:
            lg = bs.login()
            if lg.error_code != '0':
                raise ConnectionError(f"BaoStock login failed: {lg.error_msg}")
            self._logged_in = True

    def fetch_daily(
        self,
        symbol: str,
        start_date: str,
        end_date: str
    ) -> pd.DataFrame:
        """
        使用 BaoStock 获取 A 股日K线数据
        symbol: 如 '000001' (会自动转换为 sz.000001 或 sh.XXXXXX)
        注意：BaoStock 的日期格式是 '2024-01-01' 不是 '20240101'
        """
        try:
            self._ensure_login()

            # 转换 symbol 格式
            if symbol.startswith('sh') or symbol.startswith('sz'):
                bs_symbol = symbol  # 已经是正确格式
            else:
                # 假设 6 位代码是上海，其他是深圳
                if len(symbol) == 6:
                    if symbol.startswith('6'):
                        bs_symbol = f'sh.{symbol}'
                    else:
                        bs_symbol = f'sz.{symbol}'
                else:
                    bs_symbol = f'sz.{symbol}'

            # 转换日期格式 (YYYYMMDD -> YYYY-MM-DD)
            if len(start_date) == 8:
                start_date = f'{start_date[:4]}-{start_date[4:6]}-{start_date[6:8]}'
            if len(end_date) == 8:
                end_date = f'{end_date[:4]}-{end_date[4:6]}-{end_date[6:8]}'

            rs = bs.query_history_k_data_plus(
                bs_symbol,
                'date,open,high,low,close,volume,amount',
                start_date=start_date,
                end_date=end_date,
                frequency='d'
            )

            if rs.error_code != '0':
                raise ConnectionError(f"BaoStock query failed: {rs.error_msg}")

            data_list = []
            while rs.next():
                data_list.append(rs.get_row_data())

            if not data_list:
                return pd.DataFrame()

            df = pd.DataFrame(data_list, columns=rs.fields)

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

            # 转换数值类型
            for col in ["open", "close", "high", "low", "volume", "amount"]:
                if col in df.columns:
                    df[col] = pd.to_numeric(df[col], errors='coerce')

            return df

        except ConnectionError:
            raise
        except Exception as e:
            raise ConnectionError(f"BaoStock failed: {str(e)}") from e


class DataSourceManager:
    """
    数据源管理器
    自动检测可用性，优先使用 AKShare
    """

    def __init__(self):
        self.akshare = AKShareDataSource()
        self.tushare = TushareDataSource()
        self.baostock = BaoStockDataSource()
        self._current_source: Optional[BaseDataSource] = None
        self._preferred_source = "baostock"  # 用户偏好，baostock更稳定

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
        elif self._preferred_source == "baostock":
            self._current_source = self.baostock
        else:
            # 默认使用 BaoStock（最稳定）
            self._current_source = self.baostock

        return self._current_source

    def set_preferred_source(self, source: str):
        """设置偏好数据源"""
        self._preferred_source = source
        self._current_source = None  # 重置

    def get_available_sources(self) -> list:
        """获取所有可用的数据源"""
        sources = []
        sources.append({
            "name": "BaoStock",
            "id": "baostock",
            "available": self.baostock.is_available(),
            "description": "免费无需Token，稳定可靠（默认）"
        })
        sources.append({
            "name": "AKShare",
            "id": "akshare",
            "available": self.akshare.is_available(),
            "description": "免费开源数据源"
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
