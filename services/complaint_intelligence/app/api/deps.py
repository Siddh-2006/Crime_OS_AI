"""
FastAPI dependency providers.
All injected dependencies are resolved here — never imported directly
in route handlers (keeps routes thin and testable).
"""
from __future__ import annotations

from typing import Annotated

import redis.asyncio as aioredis
from fastapi import Depends

from app.core.config import Settings, settings
from app.core.container import Container, get_container
from app.core.redis import get_redis
from app.queue.interface import IQueue
from app.queue.redis_queue import RedisQueue


async def get_queue() -> IQueue:
    """Provides production RedisQueue if Redis is alive, or MockQueue fallback."""
    from app.core.redis import ping_redis, get_redis
    from app.queue.mock_queue import MockQueue
    if await ping_redis():
        redis_client = await get_redis()
        return RedisQueue(redis_client)
    return MockQueue()


def get_settings() -> Settings:
    return settings


def get_di_container() -> Container:
    return get_container()
