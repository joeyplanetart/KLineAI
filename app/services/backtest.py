import pandas as pd
import numpy as np
from typing import Dict, List, Any
from datetime import datetime

class SimpleBacktestEngine:
    """
    简化版回测引擎，支持自定义指标代码。
    """

    def backtest(
        self,
        data: pd.DataFrame,
        strategy_code: str,
        initial_capital: float = 1000000,
        commission: float = 0.0002
    ) -> Dict[str, Any]:
        """
        执行回测。

        Args:
            data: 包含 date, open, high, low, close, volume 的 DataFrame
            strategy_code: 策略代码（用于标识）
            initial_capital: 初始资金
            commission: 手续费率 (默认0.02%)

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
        df = df.reset_index(drop=True)

        # 初始化资金和持仓
        cash = initial_capital
        shares = 0
        position = False

        # 交易记录
        trades = []
        open_position = None  # 持仓信息

        # 计算技术指标
        close = df['close'].values

        # 默认双均线策略
        ma5 = pd.Series(close).rolling(window=5).mean().values
        ma10 = pd.Series(close).rolling(window=10).mean().values
        ma20 = pd.Series(close).rolling(window=20).mean().values

        # 解析并执行自定义指标代码
        buy_signal = np.zeros(len(df), dtype=bool)
        sell_signal = np.zeros(len(df), dtype=bool)

        if strategy_code and strategy_code != 'default_ma_cross':
            try:
                # 创建局部命名空间用于执行指标代码
                local_ns = {
                    'df': df,
                    'close': close,
                    'open': df['open'].values,
                    'high': df['high'].values,
                    'low': df['low'].values,
                    'volume': df['volume'].values,
                    'ma5': ma5,
                    'ma10': ma10,
                    'ma20': ma20,
                    'buy': buy_signal,
                    'sell': sell_signal,
                    'np': np,
                    'pd': pd,
                }
                exec(strategy_code, local_ns)
                # 获取修改后的信号 - 支持两种格式
                if 'df' in local_ns:
                    df_result = local_ns['df']
                    if 'buy' in df_result.columns:
                        buy_signal = df_result['buy'].fillna(False).values
                    if 'sell' in df_result.columns:
                        sell_signal = df_result['sell'].fillna(False).values
                else:
                    buy_signal = local_ns.get('buy', buy_signal)
                    sell_signal = local_ns.get('sell', sell_signal)
            except Exception as e:
                print(f"Indicator code execution error: {e}")
                # 如果执行失败，使用默认均线策略

        # 回测循环
        portfolio_values = []
        for i in range(len(df)):
            row = df.iloc[i]

            # 计算当前投资组合价值
            portfolio_value = cash + shares * row['close']

            # 交易信号检测
            signal = None
            if i >= 1:
                # 使用自定义指标信号（仅当有自定义指标时才检查）
                if strategy_code and strategy_code != 'default_ma_cross':
                    if buy_signal[i] and not position:
                        signal = 'BUY'
                    elif sell_signal[i] and position:
                        signal = 'SELL'

                # 使用默认均线策略（金叉/死叉）
                if not signal and i >= 20:
                    # 金叉：ma5上穿ma20 → 买入
                    if ma5[i-1] <= ma20[i-1] and ma5[i] > ma20[i]:
                        if not position:
                            signal = 'BUY'
                            buy_signal[i] = True  # 记录买入信号
                    # 死叉：ma5下穿ma20 → 卖出
                    elif ma5[i-1] >= ma20[i-1] and ma5[i] < ma20[i]:
                        if position:
                            signal = 'SELL'
                            sell_signal[i] = True  # 记录卖出信号

            # 执行交易
            if signal == 'BUY' and not position:
                if cash >= row['close']:
                    shares_to_buy = int(cash / row['close'])
                    if shares_to_buy > 0:
                        cost = shares_to_buy * row['close'] * (1 + commission)
                        cash -= cost
                        shares = shares_to_buy
                        position = True
                        open_position = {
                            'date': str(row['date']),
                            'price': row['close'],
                            'shares': shares_to_buy,
                        }
                        trades.append({
                            "date": str(row['date']),
                            "action": "BUY",
                            "price": round(row['close'], 2),
                            "shares": shares_to_buy,
                            "amount": round(shares_to_buy * row['close'], 2),
                            "fee": round(shares_to_buy * row['close'] * commission, 2),
                        })

            elif signal == 'SELL' and position:
                revenue = shares * row['close'] * (1 - commission)
                profit = revenue - open_position['price'] * open_position['shares'] * (1 + commission) if open_position else 0

                trades.append({
                    "date": str(row['date']),
                    "action": "SELL",
                    "price": round(row['close'], 2),
                    "shares": shares,
                    "amount": round(shares * row['close'], 2),
                    "fee": round(shares * row['close'] * commission, 2),
                    "profit": round(profit, 2),
                })

                cash += revenue
                shares = 0
                position = False
                open_position = None

            portfolio_values.append({
                "date": str(row['date']),
                "value": round(cash + shares * row['close'], 2)
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

        # 计算胜率 - 基于完整的买卖对
        win_trades = 0
        lose_trades = 0
        completed_trades = []

        buy_trade = None
        for trade in trades:
            if trade['action'] == 'BUY':
                buy_trade = trade
            elif trade['action'] == 'SELL' and buy_trade is not None:
                # 计算这笔交易的盈亏
                buy_cost = buy_trade['shares'] * buy_trade['price'] * (1 + commission)
                sell_revenue = trade['shares'] * trade['price'] * (1 - commission)
                profit = sell_revenue - buy_cost

                completed_trades.append({
                    'buy_date': buy_trade['date'],
                    'sell_date': trade['date'],
                    'buy_price': buy_trade['price'],
                    'sell_price': trade['price'],
                    'shares': trade['shares'],
                    'profit': round(profit, 2),
                })

                if profit > 0:
                    win_trades += 1
                else:
                    lose_trades += 1

                buy_trade = None

        # 胜率基于完成的交易对
        total_closed_trades = win_trades + lose_trades
        win_rate = (win_trades / total_closed_trades * 100) if total_closed_trades > 0 else 0

        return {
            "strategy_code": strategy_code,
            "initial_capital": initial_capital,
            "final_value": round(final_value, 2),
            "total_return": round(total_return, 2),
            "sharpe_ratio": round(sharpe_ratio, 2),
            "max_drawdown": round(max_drawdown, 2),
            "total_trades": len([t for t in trades if t['action'] == 'BUY']),  # 买入次数
            "completed_trades": len(completed_trades),  # 完成的交易对
            "win_trades": win_trades,
            "lose_trades": lose_trades,
            "win_rate": round(win_rate, 2),
            "trades": trades,
            "portfolio_values": portfolio_values,
            "completed_trade_details": completed_trades,
            "buy_signals": [str(df.iloc[i]['date']) for i, b in enumerate(buy_signal) if b],
            "sell_signals": [str(df.iloc[i]['date']) for i, s in enumerate(sell_signal) if s],
        }


backtest_engine = SimpleBacktestEngine()