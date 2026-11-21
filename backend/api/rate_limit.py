import os
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, status

try:
    import redis as redis_lib
except ImportError:  # pragma: no cover - optional dependency in dev
    redis_lib = None


def _get_redis_client():
    """Return a Redis client if REDIS_URL is configured and reachable, else None."""
    redis_url = os.environ.get("REDIS_URL", "").strip()
    if not redis_url or redis_lib is None:
        return None
    try:
        client = redis_lib.Redis.from_url(
            redis_url,
            socket_connect_timeout=0.5,
            socket_timeout=0.5,
            decode_responses=True,
        )
        client.ping()
        return client
    except Exception:
        return None


class SlidingWindowRateLimiter:
    """Sliding window rate limiter using Redis when configured, with in-memory fallback."""

    def __init__(self, max_requests: int, window_seconds: int = 60, namespace: str = "rl"):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.namespace = namespace
        self._buckets: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()
        self._redis = _get_redis_client()

    def _raise_limited(self) -> None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": {
                    "code": "rate_limited",
                    "message": "Too many requests. Please slow down.",
                }
            },
        )

    def _check_redis(self, key: str) -> bool:
        """Check and record hit in Redis sorted set. Returns False if Redis fails."""
        if self._redis is None:
            return False
        now = time.time()
        cutoff = now - self.window_seconds
        redis_key = f"cairn:{self.namespace}:{key}"
        member = f"{now}:{time.monotonic_ns()}"
        try:
            pipe = self._redis.pipeline()
            pipe.zremrangebyscore(redis_key, 0, cutoff)
            pipe.zcard(redis_key)
            _, count = pipe.execute()
            if int(count) >= self.max_requests:
                self._raise_limited()
            pipe = self._redis.pipeline()
            pipe.zadd(redis_key, {member: now})
            pipe.expire(redis_key, self.window_seconds + 5)
            pipe.execute()
            return True
        except HTTPException:
            raise
        except Exception:
            return False

    def check(self, key: str) -> None:
        if self._check_redis(key):
            return

        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            bucket = self._buckets[key]
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= self.max_requests:
                self._raise_limited()
            bucket.append(now)

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()


# Limits per ARCHITECTURE.md section 12
search_rate_limiter = SlidingWindowRateLimiter(
    max_requests=30, window_seconds=60, namespace="search"
)
write_rate_limiter = SlidingWindowRateLimiter(
    max_requests=60, window_seconds=60, namespace="write"
)
render_rate_limiter = SlidingWindowRateLimiter(
    max_requests=30, window_seconds=60, namespace="render"
)
report_rate_limiter = SlidingWindowRateLimiter(
    max_requests=5, window_seconds=3600, namespace="report"
)
global_ip_rate_limiter = SlidingWindowRateLimiter(
    max_requests=300, window_seconds=60, namespace="global_ip"
)
