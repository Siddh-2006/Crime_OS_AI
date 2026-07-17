"""
Qdrant client singleton.

Creates (or reuses) a persistent AsyncQdrantClient connected to the
Qdrant instance defined in settings. The collection is created on first
startup if it does not already exist.
"""
from qdrant_client import AsyncQdrantClient
from qdrant_client.http.models import Distance, VectorParams

from app.core.config import settings
from app.core.logging import logger

# ── Module-level singleton ───────────────────────────────────────────────────
_qdrant_client: AsyncQdrantClient | None = None


def get_qdrant_client() -> AsyncQdrantClient:
    """Return the module-level Qdrant client (lazy init)."""
    global _qdrant_client
    if _qdrant_client is None:
        _qdrant_client = AsyncQdrantClient(url=settings.QDRANT_URL)
        logger.info(
            "Qdrant client initialised",
            extra={"url": settings.QDRANT_URL},
        )
    return _qdrant_client


async def ensure_collection() -> None:
    """
    Called once during FastAPI lifespan startup.
    Creates the collection if it does not exist; otherwise leaves it intact.
    """
    client = get_qdrant_client()

    existing = [c.name for c in (await client.get_collections()).collections]
    if settings.QDRANT_COLLECTION in existing:
        logger.info(
            "Qdrant collection already exists",
            extra={"collection": settings.QDRANT_COLLECTION},
        )
        return

    await client.create_collection(
        collection_name=settings.QDRANT_COLLECTION,
        vectors_config=VectorParams(
            size=settings.EMBEDDING_DIM,
            distance=Distance.COSINE,
        ),
    )
    logger.info(
        "Qdrant collection created",
        extra={
            "collection": settings.QDRANT_COLLECTION,
            "dim": settings.EMBEDDING_DIM,
            "distance": "Cosine",
        },
    )
