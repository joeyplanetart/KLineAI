import json
from typing import Any, Optional, List
from datetime import datetime
import redis
from redis.lock import Lock

from app.core.config import settings
from app.services.cache.cache_keys import CacheKey, CacheTTL


class CacheManager:
    """
    Redis cache manager for stock data caching.
    Provides get/set/delete operations with JSON serialization.
    """

    def __init__(self, redis_url: str = None):
        self.redis_url = redis_url or settings.REDIS_URL
        self._client: Optional[redis.Redis] = None

    @property
    def client(self) -> redis.Redis:
        """Lazy initialization of Redis client"""
        if self._client is None:
            self._client = redis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
            )
        return self._client

    def _serialize(self, value: Any) -> str:
        """Serialize value to JSON string"""
        if isinstance(value, (datetime,)):
            return value.isoformat()
        return json.dumps(value, default=str)

    def _deserialize(self, value: str) -> Any:
        """Deserialize JSON string to value"""
        if value is None:
            return None
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        try:
            value = self.client.get(key)
            return self._deserialize(value)
        except redis.RedisError as e:
            print(f"Cache get error for key {key}: {e}")
            return None

    def set(self, key: str, value: Any, ttl: int = None) -> bool:
        """Set value to cache with optional TTL"""
        try:
            serialized = self._serialize(value)
            if ttl:
                return self.client.setex(key, ttl, serialized)
            return self.client.set(key, serialized)
        except redis.RedisError as e:
            print(f"Cache set error for key {key}: {e}")
            return False

    def delete(self, key: str) -> bool:
        """Delete key from cache"""
        try:
            return bool(self.client.delete(key))
        except redis.RedisError as e:
            print(f"Cache delete error for key {key}: {e}")
            return False

    def exists(self, key: str) -> bool:
        """Check if key exists in cache"""
        try:
            return bool(self.client.exists(key))
        except redis.RedisError as e:
            print(f"Cache exists error for key {key}: {e}")
            return False

    def expire(self, key: str, ttl: int) -> bool:
        """Set expiration time for key"""
        try:
            return bool(self.client.expire(key, ttl))
        except redis.RedisError as e:
            print(f"Cache expire error for key {key}: {e}")
            return False

    def keys(self, pattern: str) -> List[str]:
        """Get all keys matching pattern"""
        try:
            return list(self.client.keys(pattern))
        except redis.RedisError as e:
            print(f"Cache keys error for pattern {pattern}: {e}")
            return []

    def flush_pattern(self, pattern: str) -> int:
        """Delete all keys matching pattern"""
        try:
            keys = self.keys(pattern)
            if keys:
                return self.client.delete(*keys)
            return 0
        except redis.RedisError as e:
            print(f"Cache flush pattern error for {pattern}: {e}")
            return 0

    # ========== Stock-specific cache operations ==========

    def get_realtime_quote(self, symbol: str) -> Optional[dict]:
        """Get real-time quote for a stock"""
        key = CacheKey.REALTIME_QUOTE.value.format(symbol=symbol)
        return self.get(key)

    def set_realtime_quote(self, symbol: str, quote: dict, ttl: int = None) -> bool:
        """Set real-time quote for a stock"""
        key = CacheKey.REALTIME_QUOTE.value.format(symbol=symbol)
        ttl = ttl or CacheTTL.REALTIME
        return self.set(key, quote, ttl)

    def get_daily_data(self, symbol: str) -> Optional[List[dict]]:
        """Get daily k-line data for a stock"""
        key = CacheKey.DAILY_DATA.value.format(symbol=symbol)
        return self.get(key)

    def set_daily_data(self, symbol: str, data: List[dict], ttl: int = None) -> bool:
        """Set daily k-line data for a stock"""
        key = CacheKey.DAILY_DATA.value.format(symbol=symbol)
        ttl = ttl or CacheTTL.DAILY
        return self.set(key, data, ttl)

    def get_stock_info(self, symbol: str) -> Optional[dict]:
        """Get stock info"""
        key = CacheKey.STOCK_INFO.value.format(symbol=symbol)
        return self.get(key)

    def set_stock_info(self, symbol: str, info: dict, ttl: int = None) -> bool:
        """Set stock info"""
        key = CacheKey.STOCK_INFO.value.format(symbol=symbol)
        ttl = ttl or CacheTTL.STOCK_INFO
        return self.set(key, info, ttl)

    def get_market_index(self, index_name: str) -> Optional[dict]:
        """Get market index data"""
        key = CacheKey.MARKET_INDEX.value.format(name=index_name)
        return self.get(key)

    def set_market_index(self, index_name: str, data: dict, ttl: int = None) -> bool:
        """Set market index data"""
        key = CacheKey.MARKET_INDEX.value.format(name=index_name)
        ttl = ttl or CacheTTL.MARKET_INDEX
        return self.set(key, data, ttl)

    # ========== Distributed lock operations ==========

    def acquire_lock(
        self,
        lock_name: str,
        timeout: int = None,
        blocking: bool = True,
        blocking_timeout: float = 10.0,
    ) -> Optional[Lock]:
        """
        Acquire a distributed lock.
        Returns the Lock object if successful, None otherwise.
        """
        ttl = timeout or CacheTTL.LOCK
        lock = self.client.lock(
            lock_name,
            timeout=ttl,
            blocking=blocking,
            blocking_timeout=blocking_timeout,
        )
        if lock.acquire(blocking=blocking, blocking_timeout=blocking_timeout):
            return lock
        return None

    def release_lock(self, lock: Lock) -> bool:
        """Release a distributed lock"""
        try:
            lock.release()
            return True
        except redis.RedisError as e:
            print(f"Error releasing lock: {e}")
            return False

    def acquire_fetch_lock(self, symbol: str, timeout: int = None) -> Optional[Lock]:
        """Acquire lock for fetching stock data"""
        lock_name = CacheKey.LOCK_FETCH.value.format(symbol=symbol)
        return self.acquire_lock(lock_name, timeout)

    def acquire_batch_lock(self, batch_id: str, timeout: int = None) -> Optional[Lock]:
        """Acquire lock for batch operations"""
        lock_name = CacheKey.LOCK_BATCH.value.format(batch_id=batch_id)
        return self.acquire_lock(lock_name, timeout)

    # ========== Cache invalidation ==========

    def invalidate_stock_cache(self, symbol: str) -> int:
        """Invalidate all cache entries for a stock"""
        patterns = [
            CacheKey.REALTIME_QUOTE.value.format(symbol=symbol),
            CacheKey.DAILY_DATA.value.format(symbol=symbol),
            CacheKey.STOCK_INFO.value.format(symbol=symbol),
        ]
        count = 0
        for pattern in patterns:
            count += self.flush_pattern(pattern)
        return count

    def invalidate_market_cache(self) -> int:
        """Invalidate all market-related cache"""
        patterns = [
            CacheKey.STOCK_LIST_ALL.value,
            CacheKey.MARKET_INDEX.value.format(name="*"),
            CacheKey.DATA_QUALITY_SUMMARY.value.format(days="*"),
        ]
        count = 0
        for pattern in patterns:
            count += self.flush_pattern(pattern)
        return count

    # ========== Health check ==========

    def ping(self) -> bool:
        """Check if Redis is available"""
        try:
            return self.client.ping()
        except redis.RedisError:
            return False

    def close(self):
        """Close Redis connection"""
        if self._client:
            self._client.close()
            self._client = None


# Global cache manager instance
cache_manager = CacheManager()
