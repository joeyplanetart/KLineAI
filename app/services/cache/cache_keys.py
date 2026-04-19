from enum import Enum
from dataclasses import dataclass


class CacheKey(str, Enum):
    """Cache key patterns for Redis"""

    # Real-time quote keys
    REALTIME_QUOTE = "stock:realtime:{symbol}"

    # Daily k-line data
    DAILY_DATA = "stock:daily:{symbol}:list"

    # Stock list
    STOCK_LIST_ALL = "stock:list:all"
    STOCK_LIST_BY_EXCHANGE = "stock:list:{exchange}"

    # Stock info
    STOCK_INFO = "stock:info:{symbol}"

    # Market indices
    MARKET_INDEX = "market:index:{name}"

    # Data quality
    DATA_QUALITY_SUMMARY = "data:quality:summary:{days}"

    # Search results
    SEARCH_RESULTS = "search:stock:{query}"

    # Distributed locks
    LOCK_FETCH = "lock:fetch:{symbol}"
    LOCK_BATCH = "lock:batch:{batch_id}"

    # Rate limiting
    RATE_LIMIT = "ratelimit:{endpoint}:{user_id}"


@dataclass
class CacheTTL:
    """TTL values in seconds for different cache types"""

    # Real-time data - 30 seconds (stock market data updates frequently)
    REALTIME: int = 30

    # Daily k-line data - 5 minutes
    DAILY: int = 300

    # Stock list - 1 hour
    STOCK_LIST: int = 3600

    # Stock info - 1 hour
    STOCK_INFO: int = 3600

    # Market index - 1 minute
    MARKET_INDEX: int = 60

    # Search results - 5 minutes
    SEARCH: int = 300

    # Data quality summary - 30 minutes
    DATA_QUALITY: int = 1800

    # Lock timeout - 5 minutes (for distributed locks)
    LOCK: int = 300

    # Rate limit - 1 minute
    RATE_LIMIT: int = 60

    @classmethod
    def get_ttl(cls, cache_key: CacheKey) -> int:
        """Get TTL value for a specific cache key type"""
        ttl_map = {
            cls.REALTIME: cls.REALTIME,
            cls.DAILY: cls.DAILY,
            cls.STOCK_LIST: cls.STOCK_LIST,
            cls.STOCK_INFO: cls.STOCK_INFO,
            cls.MARKET_INDEX: cls.MARKET_INDEX,
            cls.SEARCH: cls.SEARCH,
            cls.DATA_QUALITY: cls.DATA_QUALITY,
            cls.LOCK: cls.LOCK,
            cls.RATE_LIMIT: cls.RATE_LIMIT,
        }
        return ttl_map.get(cache_key, 300)  # default 5 minutes
