import pandas as pd
from sqlalchemy.orm import Session
from app.models.stock import StockDaily
from app.models.data_quality import DataQualityLog, AnomalyType
from app.services.data_source_manager import data_source_manager
from app.services.data_validator.validators import DataValidator
from app.core.config import settings


def fetch_and_save_daily_data(
    db: Session,
    symbol: str,
    start_date: str,
    end_date: str,
    source: str = "auto",
    validate: bool = True,
    adjust: str = "qfq"
) -> dict:
    """
    Fetch daily k-line data and save to database.
    start_date, end_date format: 'YYYYMMDD'
    source: 'auto', 'baostock', 'akshare', or 'tushare'
    validate: whether to run data validation
    adjust: 'qfq' (前复权), 'hfq' (后复权), '3' (不复权)
    """
    result = {
        "success": False,
        "message": "",
        "records_count": 0,
        "validated_count": 0,
        "anomaly_count": 0,
        "source": source
    }

    tried_sources = []
    validator = DataValidator(
        max_pct_change=settings.MAX_PCT_CHANGE,
        max_amplitude=settings.MAX_AMPLITUDE,
        min_price=settings.MIN_PRICE
    ) if validate else None

    try:
        # 设置数据源偏好
        if source != "auto":
            data_source_manager.set_preferred_source(source)

        # 获取数据（带复权参数）
        df = data_source_manager.fetch_daily(symbol, start_date, end_date, adjust=adjust)

        if df is None or df.empty:
            result["message"] = f"No data fetched for {symbol} ({start_date} to {end_date})"
            return result

        # 数据清洗和转换
        records = []
        # 按日期排序，确保按时间顺序处理
        df = df.sort_values('date')

        # 用于跟踪前一日收盘价
        prev_close = None

        for _, row in df.iterrows():
            trade_date = row.get("date")
            if isinstance(trade_date, str):
                trade_date = pd.to_datetime(trade_date).date()
            elif hasattr(trade_date, 'date'):
                trade_date = trade_date.date()

            # 准备原始数据用于校验
            open_price = row.get("open", 0)
            close_price = row.get("close", 0)

            # 计算涨跌幅：如果有前一日收盘价则用它计算，否则用开盘价
            raw_pct_change = row.get("pct_change", 0.0)
            if prev_close and prev_close != 0:
                pct_change = round((close_price - prev_close) / prev_close * 100, 2)
            elif raw_pct_change == 0 and open_price and open_price != 0:
                pct_change = round((close_price - open_price) / open_price * 100, 2)
            else:
                pct_change = raw_pct_change

            # 计算涨跌额
            if prev_close and prev_close != 0:
                change_amount = round(close_price - prev_close, 4)
            else:
                change_amount = close_price - open_price if open_price else 0.0

            raw_data = {
                "symbol": symbol,
                "trade_date": trade_date,
                "open": open_price,
                "close": close_price,
                "high": row.get("high", 0),
                "low": row.get("low", 0),
                "volume": int(row.get("volume", 0)) if row.get("volume") else 0,
                "amount": row.get("amount", 0),
                "change_amount": change_amount,
                "pct_change": pct_change,
                "turnover_rate": row.get("turnover_rate", 0.0),
                "amplitude": row.get("amplitude", 0.0),
            }

            # 数据校验
            has_anomaly = False
            anomaly_details = None
            anomaly_records = []

            if validator:
                validation_results = validator.validate(raw_data)
                critical_errors = validator.get_critical_errors(raw_data)

                if critical_errors:
                    # 记录严重错误到数据质量日志
                    for vr in critical_errors:
                        _log_anomaly(db, symbol, trade_date, vr)
                        anomaly_records.append(vr.message)
                        has_anomaly = True

                if validation_results:
                    result["validated_count"] += 1

            record = StockDaily(
                symbol=symbol,
                name="",
                trade_date=trade_date,
                open=open_price,
                close=close_price,
                high=row.get("high", 0),
                low=row.get("low", 0),
                volume=int(row.get("volume", 0)) if row.get("volume") else 0,
                amount=row.get("amount", 0),
                change_amount=change_amount,
                pct_change=pct_change,
                turnover_rate=row.get("turnover_rate", 0.0) if row.get("turnover_rate") else 0.0,
                # 计算振幅: (最高价-最低价)/前收盘价 * 100
                amplitude=row.get("amplitude", 0.0) if row.get("amplitude") else ((float(row.get("high", 0)) - float(row.get("low", 0))) / float(prev_close) * 100) if prev_close and prev_close != 0 else 0.0,
                pe=0.0,
                pb=0.0,
                is_validated=validate,
                has_anomaly=has_anomaly,
                anomaly_details={"anomalies": anomaly_records} if anomaly_records else None
            )
            records.append(record)

            if has_anomaly:
                result["anomaly_count"] += 1

            # 更新前一日收盘价，供下一日计算涨跌幅
            prev_close = close_price

        # 插入数据库 (upsert - 覆盖已存在的记录)
        for record in records:
            existing = db.query(StockDaily).filter(
                StockDaily.symbol == record.symbol,
                StockDaily.trade_date == record.trade_date
            ).first()
            if existing:
                # 更新已存在的记录
                existing.open = record.open
                existing.close = record.close
                existing.high = record.high
                existing.low = record.low
                existing.volume = record.volume
                existing.amount = record.amount
                existing.change_amount = record.change_amount
                existing.pct_change = record.pct_change
                existing.turnover_rate = record.turnover_rate
                existing.amplitude = record.amplitude
                existing.is_validated = record.is_validated
                existing.has_anomaly = record.has_anomaly
                existing.anomaly_details = record.anomaly_details
            else:
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
                return fetch_and_save_daily_data(db, symbol, start_date, end_date, "akshare", validate)
            elif "akshare" not in tried_sources:
                result["message"] = f"AKShare failed: {error_msg}, trying Tushare..."
                return fetch_and_save_daily_data(db, symbol, start_date, end_date, "tushare", validate)

        result["message"] = error_msg
        print(f"Error fetching/saving data for {symbol}: {e}")

    except Exception as e:
        db.rollback()
        result["message"] = f"Error: {str(e)}"
        print(f"Error fetching/saving data for {symbol}: {e}")

    return result


def _log_anomaly(
    db: Session,
    symbol: str,
    trade_date,
    validation_result
) -> DataQualityLog:
    """Log a data quality anomaly to the database"""
    log = DataQualityLog(
        symbol=symbol,
        trade_date=trade_date,
        anomaly_type=validation_result.anomaly_type,
        field_name=validation_result.field_name,
        actual_value=validation_result.actual_value,
        expected_value=validation_result.expected_value,
        details={
            "message": validation_result.message,
            "level": validation_result.level.value,
            "extra": validation_result.details
        }
    )
    db.add(log)
    return log
