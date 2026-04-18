import pandas as pd
from finrl.meta.preprocessor.preprocessors import FeatureEngineer, data_split
from finrl.meta.env_stock_trading.env_stocktrading import StockTradingEnv
from finrl.agents.stablebaselines3.models import DRLAgent

class FinRLStrategyEngine:
    def __init__(self):
        self.technical_indicators = [
            "macd",
            "boll_ub",
            "boll_lb",
            "rsi_30",
            "cci_30",
            "dx_30",
            "close_30_sma",
            "macds",
            "macdh",
        ]
        
    def prepare_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Prepare dataframe for FinRL env.
        Expected columns: date, tic, open, high, low, close, volume
        """
        # Feature Engineering
        fe = FeatureEngineer(
            use_technical_indicator=True,
            tech_indicator_list=self.technical_indicators,
            use_vix=False,
            use_turbulence=False,
            user_defined_feature=False,
        )
        processed_df = fe.preprocess_data(df)
        return processed_df
        
    def train_agent(self, train_data: pd.DataFrame, model_name: str = "ppo"):
        """
        Train a DRL agent.
        """
        stock_dimension = len(train_data.tic.unique())
        state_space = 1 + 2 * stock_dimension + len(self.technical_indicators) * stock_dimension
        
        env_kwargs = {
            "hmax": 100,
            "initial_amount": 1000000,
            "num_stock_shares": [0] * stock_dimension,
            "buy_cost_pct": [0.001] * stock_dimension,
            "sell_cost_pct": [0.001] * stock_dimension,
            "state_space": state_space,
            "stock_dim": stock_dimension,
            "tech_indicator_list": self.technical_indicators,
            "action_space": stock_dimension,
            "reward_scaling": 1e-4
        }
        
        e_train_gym = StockTradingEnv(df=train_data, **env_kwargs)
        env_train, _ = e_train_gym.get_sb_env()
        
        agent = DRLAgent(env=env_train)
        model = agent.get_model(model_name)
        
        trained_model = agent.train_model(model=model, tb_log_name=model_name, total_timesteps=50000)
        return trained_model

strategy_engine = FinRLStrategyEngine()
