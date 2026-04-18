import pandas as pd
import numpy as np
from typing import Dict, List, Any
from datetime import datetime

class SimpleBacktestEngine:
    """
    简化版回测引擎，使用 pandas 向量化计算。
    """

    def backtest(
        self,
        data: pd.DataFrame,
        strategy_code: str,
        initial_capital: float = 1000000,
        commission: float = 0.001
    ) -> Dict[str, Any]:
        """
        执行回测。

        Args:
            data: 包含 date, open, high, low, close, volume 的 DataFrame
            strategy_code: 策略代码（用于标识）
            initial_capital: 初始资金
            commission: 手续费率

        Returns:
            回测结果字典
        """
        if data is None or len(data) < 20:
            return {
                "error": "数据不足，无法回测",
                "total_return": 0,
                "sharpe_ratio": 0,
                "max_drawdown": 0,
            }

        # 按日期排序
        df = data.sort_values('date').copy()

        # 初始化资金和持仓
        cash = initial_capital
        shares = 0
        position = False

        # 交易记录
        trades = []

        # 简单的双均线策略作为默认策略
        # 如果有自定义策略代码，可以用 exec() 执行
        df['ma5'] = df['close'].rolling(window=5).mean()
        df['ma20'] = df['close'].rolling(window=20).mean()

        # 回测循环
        portfolio_values = []
        for i in range(len(df)):
            row = df.iloc[i]

            # 计算当前投资组合价值
            portfolio_value = cash + shares * row['close']

            # 交易信号
            if i >= 20:
                if df.iloc[i-1]['ma5'] <= df.iloc[i-1]['ma20'] and row['ma5'] > row['ma20']:
                    # 买入信号
                    if not position and cash >= row['close']:
                        shares_to_buy = int(cash * (1 - commission) / row['close'])
                        if shares_to_buy > 0:
                            shares += shares_to_buy
                            cash -= shares_to_buy * row['close'] * (1 + commission)
                            position = True
                            trades.append({
                                "date": str(row['date']),
                                "action": "BUY",
                                "price": row['close'],
                                "shares": shares_to_buy
                            })

                elif df.iloc[i-1]['ma5'] >= df.iloc[i-1]['ma20'] and row['ma5'] < row['ma20']:
                    # 卖出信号
                    if position and shares > 0:
                        cash += shares * row['close'] * (1 - commission)
                        trades.append({
                            "date": str(row['date']),
                            "action": "SELL",
                            "price": row['close'],
                            "shares": shares
                        })
                        shares = 0
                        position = False

            portfolio_values.append({
                "date": str(row['date']),
                "value": cash + shares * row['close']
            })

        # 计算最终收益
        final_value = cash + shares * df.iloc[-1]['close']
        total_return = (final_value - initial_capital) / initial_capital * 100

        # 计算最大回撤
        values = [p['value'] for p in portfolio_values]
        peak = values[0]
        max_drawdown = 0
        for v in values:
            if v > peak:
                peak = v
            drawdown = (peak - v) / peak * 100
            if drawdown > max_drawdown:
                max_drawdown = drawdown

        # 计算夏普比率 (简化版)
        returns = np.diff(values) / values[:-1]
        if len(returns) > 0 and np.std(returns) > 0:
            sharpe_ratio = np.mean(returns) / np.std(returns) * np.sqrt(252)
        else:
            sharpe_ratio = 0

        return {
            "strategy_code": strategy_code,
            "initial_capital": initial_capital,
            "final_value": round(final_value, 2),
            "total_return": round(total_return, 2),
            "sharpe_ratio": round(sharpe_ratio, 2),
            "max_drawdown": round(max_drawdown, 2),
            "total_trades": len(trades),
            "trades": trades[-10:] if len(trades) > 10 else trades,  # 最近10笔交易
            "portfolio_values": portfolio_values[-30:] if len(portfolio_values) > 30 else portfolio_values,  # 最近30天
        }


backtest_engine = SimpleBacktestEngine()
