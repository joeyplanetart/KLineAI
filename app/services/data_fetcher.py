import pandas as pd
from sqlalchemy.orm import Session
from app.models.stock import StockDaily
from app.services.data_source_manager import data_source_manager


def fetch_and_save_daily_data(
    db: Session,
    symbol: str,
    start_date: str,
    end_date: str,
    source: str = "auto"
) -> dict:
    """
    Fetch daily k-line data and save to database.
    start_date, end_date format: 'YYYYMMDD'
    source: 'auto', 'baostock', 'akshare', or 'tushare'
    """
    result = {
        "success": False,
        "message": "",
        "records_count": 0,
        "source": source
    }

    tried_sources = []

    try:
        # 设置数据源偏好
        if source != "auto":
            data_source_manager.set_preferred_source(source)

        # 获取数据
        df = data_source_manager.fetch_daily(symbol, start_date, end_date)

        if df is None or df.empty:
            result["message"] = f"No data fetched for {symbol}"
            return result

        # 数据清洗和转换
        records = []
        for _, row in df.iterrows():
            trade_date = row.get("date")
            if isinstance(trade_date, str):
                trade_date = pd.to_datetime(trade_date).date()
            elif hasattr(trade_date, 'date'):
                trade_date = trade_date.date()

            record = StockDaily(
                symbol=symbol,
                name="",
                trade_date=trade_date,
                open=row.get("open", 0),
                close=row.get("close", 0),
                high=row.get("high", 0),
                low=row.get("low", 0),
                volume=int(row.get("volume", 0)),
                amount=row.get("amount", 0),
                change_amount=row.get("change_amount", 0.0),
                pct_change=row.get("pct_change", 0.0),
                turnover_rate=row.get("turnover_rate", 0.0),
                amplitude=row.get("amplitude", 0.0),
                pe=0.0,
                pb=0.0
            )
            records.append(record)

        # 插入数据库
        for record in records:
            existing = db.query(StockDaily).filter(
                StockDaily.symbol == record.symbol,
                StockDaily.trade_date == record.trade_date
            ).first()
            if not existing:
                db.add(record)

        db.commit()

        result["success"] = True
        result["message"] = f"Successfully saved {len(records)} records"
        result["records_count"] = len(records)
        result["source"] = data_source_manager.current_source.get_name()
        print(result["message"])

    except ConnectionError as e:
        db.rollback()
        error_msg = str(e)

        # 如果 auto 模式失败，尝试其他数据源
        if source == "auto":
            tried_sources.append(data_source_manager.current_source.get_name())
            if "baostock" not in tried_sources:
                result["message"] = f"BaoStock failed: {error_msg}, trying AKShare..."
                return fetch_and_save_daily_data(db, symbol, start_date, end_date, "akshare")
            elif "akshare" not in tried_sources:
                result["message"] = f"AKShare failed: {error_msg}, trying Tushare..."
                return fetch_and_save_daily_data(db, symbol, start_date, end_date, "tushare")

        result["message"] = error_msg
        print(f"Error fetching/saving data for {symbol}: {e}")

    except Exception as e:
        db.rollback()
        result["message"] = f"Error: {str(e)}"
        print(f"Error fetching/saving data for {symbol}: {e}")

    return result
