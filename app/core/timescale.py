"""
TimescaleDB utilities for hypertables and continuous aggregates.
TimescaleDB is a PostgreSQL extension for time-series data.
"""
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.db import engine


def create_hypertable(table_name: str, time_column: str, if_not_exists: bool = True) -> bool:
    """
    Convert a regular PostgreSQL table to a TimescaleDB hypertable.

    Args:
        table_name: Name of the table to convert
        time_column: Name of the column to use as time dimension
        if_not_exists: If True, don't fail if hypertable already exists

    Returns:
        True if successful
    """
    with engine.connect() as conn:
        try:
            if if_not_exists:
                query = text(f"""
                    SELECT create_hypertable('{table_name}', '{time_column}',
                        if_not_exists => TRUE,
                        migrate_data => TRUE);
                """)
            else:
                query = text(f"""
                    SELECT create_hypertable('{table_name}', '{time_column}',
                        migrate_data => TRUE);
                """)

            conn.execute(query)
            conn.commit()
            print(f"Hypertable '{table_name}' created/verified successfully")
            return True

        except Exception as e:
            print(f"Error creating hypertable: {e}")
            return False


def configure_compression(
    table_name: str,
    segmentby_column: str = "symbol",
    orderby_column: str = "trade_date",
    orderby_asc: bool = True,
    chunk_interval: str = "7 days"
) -> bool:
    """
    Configure compression for a hypertable.

    Args:
        table_name: Name of the hypertable
        segmentby_column: Column to segment data by (for better compression)
        orderby_column: Column to order by within segments
        orderby_asc: Whether to order ascending
        chunk_interval: Time interval for each chunk

    Returns:
        True if successful
    """
    with engine.connect() as conn:
        try:
            # Enable compression
            alter_query = text(f"""
                ALTER TABLE {table_name} SET (
                    timescaledb.compress,
                    timescaledb.compress_segmentby = '{segmentby_column}',
                    timescaledb.compress_orderby = '{orderby_column} {"ASC" if orderby_asc else "DESC"}',
                    timescaledb.compress_chunk_time_interval = '{chunk_interval}'
                );
            """)
            conn.execute(alter_query)

            # Add compression policy (compress data older than 7 days)
            policy_query = text(f"""
                SELECT add_compression_policy('{table_name}', INTERVAL '7 days');
            """)
            conn.execute(policy_query)

            conn.commit()
            print(f"Compression configured for '{table_name}'")
            return True

        except Exception as e:
            print(f"Error configuring compression: {e}")
            return False


def create_continuous_aggregate(
    view_name: str,
    table_name: str,
    time_bucket: str = "1 day",
    aggregation: str = "AVG(close)",
    group_by_columns: str = "symbol",
    with_no_data: bool = False
) -> bool:
    """
    Create a continuous aggregate view for downsampling.

    Args:
        view_name: Name of the view to create
        table_name: Source hypertable name
        time_bucket: Time bucket interval (e.g., '1 hour', '1 day')
        aggregation: Aggregation expression
        group_by_columns: Additional GROUP BY columns
        with_no_data: If True, create with WITH NO DATA

    Returns:
        True if successful
    """
    with engine.connect() as conn:
        try:
            no_data_clause = "WITH NO DATA" if with_no_data else ""

            query = text(f"""
                CREATE MATERIALIZED VIEW {view_name}
                WITH (timescaledb.continuous) AS
                SELECT
                    time_bucket('{time_bucket}', trade_date) AS bucket,
                    {group_by_columns},
                    {aggregation}
                FROM {table_name}
                GROUP BY 1, {group_by_columns}
                {no_data_clause};
            """)

            conn.execute(query)

            # Add refresh policy
            refresh_query = text(f"""
                SELECT add_continuous_aggregate_policy('{view_name}',
                    start_offset => INTERVAL '1 week',
                    end_offset => INTERVAL '1 hour',
                    schedule_interval => INTERVAL '1 hour');
            """)
            conn.execute(refresh_query)

            conn.commit()
            print(f"Continuous aggregate '{view_name}' created successfully")
            return True

        except Exception as e:
            print(f"Error creating continuous aggregate: {e}")
            return False


def drop_hypertable(table_name: str, if_exists: bool = True) -> bool:
    """Drop a hypertable"""
    with engine.connect() as conn:
        try:
            if if_exists:
                query = text(f"DROP TABLE IF EXISTS {table_name} CASCADE;")
            else:
                query = text(f"DROP TABLE {table_name} CASCADE;")

            conn.execute(query)
            conn.commit()
            print(f"Hypertable '{table_name}' dropped")
            return True

        except Exception as e:
            print(f"Error dropping hypertable: {e}")
            return False


def get_hypertable_info(table_name: str) -> dict:
    """Get information about a hypertable"""
    with engine.connect() as conn:
        try:
            query = text(f"""
                SELECT
                    hypertable_name,
                    num_dimensions,
                    num_chunks,
                    total_bytes,
                    compressed_bytes
                FROM timescaledb_information.hypertables
                WHERE hypertable_name = '{table_name}';
            """)

            result = conn.execute(query)
            row = result.fetchone()

            if row:
                return {
                    "hypertable_name": row[0],
                    "num_dimensions": row[1],
                    "num_chunks": row[2],
                    "total_bytes": row[3],
                    "compressed_bytes": row[4]
                }

            return None

        except Exception as e:
            print(f"Error getting hypertable info: {e}")
            return None


def show_chunks(table_name: str, older_than: str = None, newer_than: str = None) -> list:
    """
    Show chunks for a hypertable.

    Args:
        table_name: Hypertable name
        older_than: Show chunks older than this interval
        newer_than: Show chunks newer than this interval

    Returns:
        List of chunk info dicts
    """
    with engine.connect() as conn:
        try:
            query = text(f"""
                SELECT
                    chunk_name,
                    table_size_bytes,
                    index_size_bytes,
                    toast_bytes
                FROM timescaledb_information.chunks
                WHERE hypertable_name = '{table_name}'
            """)

            if older_than:
                query = text(str(query) + f" AND older_than_table_name IS NOT NULL")

            if newer_than:
                query = text(str(query) + f" AND newer_than_table_name IS NOT NULL")

            result = conn.execute(query)
            rows = result.fetchall()

            return [
                {
                    "chunk_name": row[0],
                    "table_size_bytes": row[1],
                    "index_size_bytes": row[2],
                    "toast_bytes": row[3]
                }
                for row in rows
            ]

        except Exception as e:
            print(f"Error showing chunks: {e}")
            return []


# Initialization function for setting up TimescaleDB
def initialize_timescale():
    """
    Initialize TimescaleDB for stock_daily table.
    Call this once during application startup if using TimescaleDB.
    """
    print("Initializing TimescaleDB...")

    # Create hypertable
    create_hypertable("stock_daily", "trade_date", if_not_exists=True)

    # Configure compression
    configure_compression("stock_daily", segmentby_column="symbol")

    print("TimescaleDB initialization complete")


if __name__ == "__main__":
    # Run initialization
    initialize_timescale()
