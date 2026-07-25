"""
MongoDB connection manager using Motor (async driver).
Provides connection verification and database access.
"""
from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.core.logging import logger

_mongo_client: Any = None


async def get_mongo_db() -> Any:
    """Return Motor async database instance or None if unreachable."""
    global _mongo_client
    if _mongo_client is None:
        try:
            from motor.motor_asyncio import AsyncIOMotorClient
            _mongo_client = AsyncIOMotorClient(settings.MONGODB_URI, serverSelectionTimeoutMS=30000)
            await _mongo_client.admin.command('ping')
            logger.info("Connected to MongoDB successfully", extra={"url": settings.MONGODB_URI})
        except Exception as exc:
            logger.warning("MongoDB unreachable or Motor not available", extra={"error": str(exc)})
            _mongo_client = None
            return None
    return _mongo_client[settings.MONGODB_DB] if _mongo_client else None


async def close_mongo() -> None:
    """Close MongoDB connection pool."""
    global _mongo_client
    if _mongo_client is not None:
        _mongo_client.close()
        _mongo_client = None
        logger.info("Closed MongoDB connection pool")
