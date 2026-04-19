"""
数据源管理器
支持 AKShare（默认）、Tushare 和 BaoStock
"""
import akshare as ak
import baostock as bs
import pandas as pd
from abc import ABC, abstractmethod
from typing import Optional, List, Dict
from datetime import datetime
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
            # BaoStock 期望格式: 'sh.600000' 或 'sz.000001'
            if symbol.startswith('sh'):
                bs_symbol = f'sh.{symbol[2:]}'
            elif symbol.startswith('sz'):
                bs_symbol = f'sz.{symbol[2:]}'
            elif len(symbol) == 6:
                # 纯数字代码，假设 6 开头是上海，其他是深圳
                if symbol.startswith('6'):
                    bs_symbol = f'sh.{symbol}'
                else:
                    bs_symbol = f'sz.{symbol}'
            else:
                bs_symbol = symbol  # 其他格式保持原样

            # 转换日期格式 (YYYYMMDD -> YYYY-MM-DD)
            if len(start_date) == 8:
                start_date = f'{start_date[:4]}-{start_date[4:6]}-{start_date[6:8]}'
            if len(end_date) == 8:
                end_date = f'{end_date[:4]}-{end_date[4:6]}-{end_date[6:8]}'

            print(f"[BaoStock] Querying {bs_symbol} from {start_date} to {end_date}")

            rs = bs.query_history_k_data_plus(
                bs_symbol,
                'date,open,high,low,close,volume,amount',
                start_date=start_date,
                end_date=end_date,
                frequency='d'
            )

            if rs.error_code != '0':
                print(f"[BaoStock] Query error: {rs.error_msg}")
                raise ConnectionError(f"BaoStock query failed: {rs.error_msg}")

            data_list = []
            while rs.next():
                data_list.append(rs.get_row_data())

            print(f"[BaoStock] Got {len(data_list)} rows for {bs_symbol}")
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

    def fetch_stock_list(self) -> List[Dict]:
        """
        获取全市场股票列表
        返回格式: [{'symbol': 'sh600000', 'code': '600000', 'name': '浦发银行', 'exchange': 'SH'}, ...]
        """
        try:
            # 使用 AKShare 获取股票列表
            df = ak.stock_info_a_code_name()
            stocks = []
            for _, row in df.iterrows():
                code = row['code']
                name = row['name'].strip()
                # 判断交易所：6开头为上海，0/3开头为深圳
                if code.startswith('6'):
                    exchange = 'SH'
                    symbol = f'sh{code}'
                else:
                    exchange = 'SZ'
                    symbol = f'sz{code}'
                stocks.append({
                    'symbol': symbol,
                    'code': code,
                    'name': name,
                    'exchange': exchange
                })
            return stocks
        except Exception as e:
            print(f"Error fetching stock list: {e}")
            raise ConnectionError(f"Failed to fetch stock list: {e}")


    def fetch_realtime(self, symbol: str) -> Optional[Dict]:
        """
        获取实时行情数据
        symbol: 如 'sh600000', 'sz000001', '000001' (指数)
        返回格式: dict 或 None
        """
        try:
            # 尝试使用 AKShare 获取实时数据
            # 注意：实时行情接口可能不稳定
            code = symbol
            if symbol.startswith('sh') or symbol.startswith('sz'):
                code = symbol[2:]  # 去掉 sh/sz 前缀

            # 尝试获取实时行情
            try:
                df = ak.stock_zh_a_spot_em()
                if df is not None and not df.empty:
                    # 搜索对应股票
                    # 格式: 代码列可能是 'code' 或 '代码'
                    code_col = None
                    for col in df.columns:
                        if 'code' in col.lower() or '代码' in col:
                            code_col = col
                            break

                    if code_col:
                        row = df[df[code_col] == code]
                        if not row.empty:
                            row = row.iloc[0]
                            # 尝试找到对应列
                            result = {}
                            for col in df.columns:
                                col_lower = col.lower()
                                if 'name' in col_lower or '名称' in col:
                                    result['name'] = row[col]
                                elif 'price' in col_lower or '最新价' in col:
                                    result['price'] = float(row[col]) if pd.notna(row[col]) else 0
                                elif 'change' in col_lower or '涨跌' in col:
                                    result['change'] = float(row[col]) if pd.notna(row[col]) else 0
                                elif 'pct_change' in col_lower or '涨跌幅' in col:
                                    result['pct_change'] = float(row[col]) if pd.notna(row[col]) else 0
                                elif 'volume' in col_lower or '成交量' in col:
                                    result['volume'] = int(row[col]) if pd.notna(row[col]) else 0
                                elif 'amount' in col_lower or '成交额' in col:
                                    result['amount'] = float(row[col]) if pd.notna(row[col]) else 0
                                elif 'high' in col_lower or '最高' in col:
                                    result['high'] = float(row[col]) if pd.notna(row[col]) else 0
                                elif 'low' in col_lower or '最低' in col:
                                    result['low'] = float(row[col]) if pd.notna(row[col]) else 0
                                elif 'open' in col_lower or '开盘' in col:
                                    result['open'] = float(row[col]) if pd.notna(row[col]) else 0
                                elif 'prev_close' in col_lower or '昨收' in col:
                                    result['prev_close'] = float(row[col]) if pd.notna(row[col]) else 0

                            if result:
                                result['symbol'] = symbol
                                result['timestamp'] = datetime.now().isoformat()
                                return result
            except Exception as e:
                print(f"AKShare realtime fetch error: {e}")

            return None

        except Exception as e:
            print(f"Error fetching realtime for {symbol}: {e}")
            return None


# 全局单例
data_source_manager = DataSourceManager()
