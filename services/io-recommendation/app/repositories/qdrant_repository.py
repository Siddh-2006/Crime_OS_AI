"""
QdrantRepository — single source of truth for all vector DB operations.

Responsibilities (SOLID — SRP):
  - Upsert vectors with payload
  - Search for similar vectors with optional payload filters
  - Check existence of a point by firId

Business logic does NOT belong here.
"""
import time
import uuid
from typing import Optional

from qdrant_client.http.models import (
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
    ScoredPoint,
)

from app.core.config import settings
from app.core.logging import logger
from app.vector.qdrant.client import get_qdrant_client

# Fixed UUID5 namespace — ensures the same Mongo ObjectId always maps to the
# same Qdrant point UUID deterministically.
_NAMESPACE = uuid.UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890")


def _mongo_id_to_qdrant_uuid(mongo_id: str) -> str:
    """Deterministically convert a MongoDB ObjectId hex string to a UUID."""
    return str(uuid.uuid5(_NAMESPACE, mongo_id))


class QdrantRepository:
    """All Qdrant I/O is encapsulated here; business logic lives in services."""

    def __init__(self) -> None:
        self._collection = settings.QDRANT_COLLECTION

    # ── Upsert ──────────────────────────────────────────────────────────────────
    async def upsert(
        self,
        fir_id: str,
        vector: list[float],
        payload: dict,
    ) -> str:
        """
        Insert or update a single vector point identified by firId.
        Idempotent: calling twice with the same firId overwrites the first point.

        Returns:
            action: 'created' | 'updated'
        """
        t0 = time.perf_counter()
        client = get_qdrant_client()
        point_id = _mongo_id_to_qdrant_uuid(fir_id)

        # Check existence so we can report 'created' vs 'updated'
        existing = await client.retrieve(
            collection_name=self._collection,
            ids=[point_id],
            with_payload=False,
            with_vectors=False,
        )
        action = "updated" if existing else "created"

        await client.upsert(
            collection_name=self._collection,
            points=[
                PointStruct(
                    id=point_id,
                    vector=vector,
                    payload=payload,
                )
            ],
        )

        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        logger.info(
            "Vector upserted to Qdrant",
            extra={
                "firId": fir_id,
                "pointId": point_id,
                "action": action,
                "latency_ms": latency_ms,
            },
        )
        return action

    # ── Similarity Search ────────────────────────────────────────────────────────
    async def search_similar(
        self,
        vector: list[float],
        top_k: int,
        station_id: Optional[str] = None,
    ) -> list[ScoredPoint]:
        """
        Find the top-k most similar vectors in the collection.

        Uses client.search() which is the correct API for qdrant-client v1.9.x
        / Qdrant server v1.9.x.  (query_points() requires server >= v1.10.)

        Args:
            vector:     Query embedding.
            top_k:      How many results to retrieve.
            station_id: Optional payload filter — restrict search to a station.

        Returns:
            List of ScoredPoint objects sorted by score descending.
        """
        t0 = time.perf_counter()
        client = get_qdrant_client()

        query_filter: Optional[Filter] = None
        if station_id:
            query_filter = Filter(
                must=[
                    FieldCondition(
                        key="stationId",
                        match=MatchValue(value=station_id),
                    )
                ]
            )

        results: list[ScoredPoint] = await client.search(
            collection_name=self._collection,
            query_vector=vector,
            limit=top_k,
            query_filter=query_filter,
            with_payload=True,
        )

        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        logger.info(
            "Qdrant similarity search completed",
            extra={
                "top_k": top_k,
                "station_filter": station_id,
                "results_returned": len(results),
                "latency_ms": latency_ms,
            },
        )
        return results
