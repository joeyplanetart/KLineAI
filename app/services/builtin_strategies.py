"""
内置常用量化交易策略
"""

BUILTIN_STRATEGIES = [
    {
        "id": "dual_ma",
        "name": "双均线策略",
        "description": "MA5/MA20 金叉买入，死叉卖出",
        "code": """import backtrader as bt

class DualMAStrategy(bt.Strategy):
    params = (
        ('fast_period', 5),
        ('slow_period', 20),
    )

    def __init__(self):
        self.fast_ma = bt.indicators.SimpleMovingAverage(self.data.close, period=self.params.fast_period)
        self.slow_ma = bt.indicators.SimpleMovingAverage(self.data.close, period=self.params.slow_period)
        self.crossover = bt.indicators.CrossOver(self.fast_ma, self.slow_ma)

    def next(self):
        if self.crossover > 0:
            self.buy()
        elif self.crossover < 0:
            self.sell()
""",
    },
    {
        "id": "rsi",
        "name": "RSI 超买超卖策略",
        "description": "RSI低于30买入，高于70卖出",
        "code": """import backtrader as bt

class RSIStrategy(bt.Strategy):
    params = (
        ('rsi_period', 14),
        ('rsi_lower', 30),
        ('rsi_upper', 70),
    )

    def __init__(self):
        self.rsi = bt.indicators.RSI(self.data.close, period=self.params.rsi_period)

    def next(self):
        if self.rsi < self.params.rsi_lower:
            if not self.position:
                self.buy()
        elif self.rsi > self.params.rsi_upper:
            if self.position:
                self.sell()
""",
    },
    {
        "id": "macd",
        "name": "MACD 策略",
        "description": "MACD 金叉买入，死叉卖出",
        "code": """import backtrader as bt

class MACDStrategy(bt.Strategy):
    params = (
        ('fast_period', 12),
        ('slow_period', 26),
        ('signal_period', 9),
    )

    def __init__(self):
        self.macd = bt.indicators.MACD(
            self.data.close,
            period_me1=self.params.fast_period,
            period_me2=self.params.slow_period,
            period_signal=self.params.signal_period
        )
        self.crossover = bt.indicators.CrossOver(self.macd.macd, self.macd.signal)

    def next(self):
        if self.crossover > 0:
            self.buy()
        elif self.crossover < 0:
            self.sell()
""",
    },
    {
        "id": "bollinger",
        "name": "布林带策略",
        "description": "价格触及下轨买入，触及上轨卖出",
        "code": """import backtrader as bt

class BollingerStrategy(bt.Strategy):
    params = (
        ('period', 20),
        ('devfactor', 2),
    )

    def __init__(self):
        self.boll = bt.indicators.BollingerBands(
            self.data.close,
            period=self.params.period,
            devfactor=self.params.devfactor
        )

    def next(self):
        if self.data.close < self.boll.lines.bot:
            if not self.position:
                self.buy()
        elif self.data.close > self.boll.lines.top:
            if self.position:
                self.sell()
""",
    },
    {
        "id": "momentum",
        "name": "动量策略",
        "description": "N日上涨后买入，下跌后卖出",
        "code": """import backtrader as bt

class MomentumStrategy(bt.Strategy):
    params = (
        ('period', 10),
    )

    def __init__(self):
        self.momentum = bt.indicators.Momentum(self.data.close, period=self.params.period)

    def next(self):
        if self.momentum > 0 and not self.position:
            self.buy()
        elif self.momentum < 0 and self.position:
            self.sell()
""",
    },
    {
        "id": "atr_stop",
        "name": "ATR 止损策略",
        "description": "基于ATR的移动止损策略",
        "code": """import backtrader as bt

class ATRStopStrategy(bt.Strategy):
    params = (
        ('atr_period', 14),
        ('atr_multiplier', 3),
    )

    def __init__(self):
        self.atr = bt.indicators.ATR(self.data, period=self.params.atr_period)
        self.order = None

    def next(self):
        if self.order:
            return

        if not self.position:
            if self.data.close > self.data.close[-1]:
                self.buy()
        else:
            stop_price = self.data.close - self.atr * self.params.atr_multiplier
            if self.data.close < stop_price:
                self.sell()
""",
    },
    {
        "id": "grid",
        "name": "网格交易策略",
        "description": "在固定价格区间内网格买卖",
        "code": """import backtrader as bt

class GridStrategy(bt.Strategy):
    params = (
        ('grid_levels', 5),
        ('grid_size', 0.02),
    )

    def __init__(self):
        self.grid_prices = []
        self.last_grid_index = 0

    def next(self):
        if len(self.grid_prices) == 0:
            base_price = self.data.close[0]
            for i in range(self.params.grid_levels):
                self.grid_prices.append(base_price * (1 - self.params.grid_size * (i - 2)))

        current_price = self.data.close[0]
        for i, price in enumerate(self.grid_prices):
            if current_price >= price and i > self.last_grid_index and not self.position:
                self.buy()
                self.last_grid_index = i
                break
            elif current_price < price and i < self.last_grid_index and self.position:
                self.sell()
                self.last_grid_index = i
                break
""",
    },
    {
        "id": "volatility_breakout",
        "name": "波动率突破策略",
        "description": "价格突破N日波动率区间时入场",
        "code": """import backtrader as bt

class VolatilityBreakoutStrategy(bt.Strategy):
    params = (
        ('period', 20),
        ('atr_multiplier', 2),
    )

    def __init__(self):
        self.highest = bt.indicators.Highest(self.data.high, period=self.params.period)
        self.lowest = bt.indicators.Lowest(self.data.low, period=self.params.period)
        self.atr = bt.indicators.ATR(self.data, period=self.params.period)

    def next(self):
        upper = self.highest + self.atr * self.params.atr_multiplier
        lower = self.lowest - self.atr * self.params.atr_multiplier

        if self.data.close[0] > upper[0] and not self.position:
            self.buy()
        elif self.data.close[0] < lower[0] and self.position:
            self.sell()
""",
    },
]


def get_builtin_strategy(strategy_id: str) -> dict:
    """根据ID获取内置策略"""
    for s in BUILTIN_STRATEGIES:
        if s["id"] == strategy_id:
            return s
    return None


def get_all_builtin_strategies() -> list:
    """获取所有内置策略列表"""
    return [
        {"id": s["id"], "name": s["name"], "description": s["description"]}
        for s in BUILTIN_STRATEGIES
    ]
