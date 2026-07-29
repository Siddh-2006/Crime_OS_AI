"""
MongoDB connection manager using Motor (async driver).
Provides connection verification and database access.
"""
from __future__ import annotations

import asyncio
from typing import Any

from app.core.config import settings
from app.core.logging import logger

_mongo_client: Any = None


async def get_mongo_db() -> Any:
    """Return Motor async database instance or None if unreachable."""
    global _mongo_client
    if _mongo_client is None:
        from motor.motor_asyncio import AsyncIOMotorClient
        client_kwargs: dict[str, Any] = {
            "serverSelectionTimeoutMS": 30000,
            "connectTimeoutMS": 10000,
        }
        if "mongodb+srv" in settings.MONGODB_URI or "ssl=true" in settings.MONGODB_URI.lower():
            client_kwargs["tls"] = True
            client_kwargs["tlsAllowInvalidCertificates"] = True
            try:
                import certifi
                client_kwargs["tlsCAFile"] = certifi.where()
            except ImportError:
                pass

        for attempt in range(1, 4):
            try:
                client = AsyncIOMotorClient(settings.MONGODB_URI, **client_kwargs)
                await client.admin.command('ping')
                _mongo_client = client
                logger.info("Connected to MongoDB successfully", extra={"url": settings.MONGODB_URI, "attempt": attempt})
                break
            except Exception as exc:
                logger.warning(
                    f"MongoDB connection attempt {attempt}/3 failed",
                    extra={"error": str(exc), "attempt": attempt},
                )
                if attempt < 3:
                    await asyncio.sleep(1.0)
                else:
                    _mongo_client = None
                    return None

    return _mongo_client[settings.MONGODB_DB] if _mongo_client else None


async def ensure_mongo_indexes() -> None:
    """Ensure B-Tree indexes on case_id and token fields across all collections for O(log N) sub-ms lookups."""
    db = await get_mongo_db()
    if db is None:
        return
    try:
        await db["complaint_profiles"].create_index([("case_id", 1)], unique=True, background=True)
        await db["evidence_profiles"].create_index([("case_id", 1)], background=True)
        await db["evidence_records"].create_index([("case_id", 1)], background=True)
        await db["upload_tokens"].create_index([("token", 1)], unique=True, background=True)
        await db["upload_tokens"].create_index([("case_id", 1)], unique=True, background=True)
        logger.info("MongoDB B-Tree indexes verified across all collections")
    except Exception as exc:
        logger.warning("Failed to create MongoDB indexes", extra={"error": str(exc)})


async def close_mongo() -> None:
    """Close MongoDB connection pool."""
    global _mongo_client
    if _mongo_client is not None:
        _mongo_client.close()
        _mongo_client = None
        logger.info("Closed MongoDB connection pool")
