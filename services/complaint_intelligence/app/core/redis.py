"""
Redis connection management.
Single async connection pool shared across the application.
"""
from __future__ import annotations

from typing import Optional

import redis.asyncio as aioredis

from app.core.config import settings
from app.core.logging import logger

_pool: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    """Return the shared Redis connection. Creates it on first call."""
    global _pool
    if _pool is None:
        _pool = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
            retry_on_timeout=True,
            health_check_interval=30,
        )
        logger.info("Redis connection pool created", extra={"url": settings.redis_url})
    return _pool


async def close_redis() -> None:
    """Close the connection pool on shutdown."""
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None
        logger.info("Redis connection pool closed")


async def ping_redis() -> bool:
    """Return True if Redis is reachable, False otherwise."""
    try:
        client = await get_redis()
        return await client.ping()
    except Exception as exc:
        logger.warning("Redis ping failed", extra={"error": str(exc)})
        return False
