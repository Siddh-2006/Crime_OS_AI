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


async def get_queue(
    redis_client: Annotated[aioredis.Redis, Depends(get_redis)],
) -> IQueue:
    """Provides the production RedisQueue. Override in tests with MockQueue."""
    return RedisQueue(redis_client)


def get_settings() -> Settings:
    return settings


def get_di_container() -> Container:
    return get_container()
