from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Sequence

from ingestion.schemas import LegalSectionRecord

from .models import EmbeddedLegalRecord, LegalRetrievalResult


def _load_qdrant():
    try:
        from qdrant_client import QdrantClient, models
    except Exception as exc:  # pragma: no cover - dependency missing
        raise RuntimeError("qdrant-client is required for vector storage and retrieval.") from exc
    return QdrantClient, models


@dataclass(slots=True)
class LegalQdrantConfig:
    url: str = "http://localhost:6333"
    collection_name: str = "legal"
    prefer_grpc: bool = False
    timeout: float | None = None



class LegalQdrantStore:
    def __init__(self, config: LegalQdrantConfig | None = None) -> None:
        self.config = config or LegalQdrantConfig()
        QdrantClient, models = _load_qdrant()
        self._client = QdrantClient(url=self.config.url, prefer_grpc=self.config.prefer_grpc, timeout=self.config.timeout, check_compatibility=False)
        self._models = models

    @property
    def client(self):
        return self._client

    def _connection_error_message(self) -> str:
        return (
            f"Unable to reach Qdrant at {self.config.url}. "
            "Start the local server first, for example: "
            "docker run -p 6333:6333 qdrant/qdrant"
        )

    def ensure_collection(self, vector_size: int) -> None:
        models = self._models
        if self.client.collection_exists(self.config.collection_name):
            return
        self.client.create_collection(
            collection_name=self.config.collection_name,
            vectors_config=models.VectorParams(size=vector_size, distance=models.Distance.COSINE),
        )

    def _search_points(self, query_vector: Sequence[float], *, limit: int = 20, query_filter: Any | None = None):
        kwargs: dict[str, Any] = {
            "collection_name": self.config.collection_name,
            "limit": limit,
            "with_payload": True,
        }
        if query_filter is not None:
            kwargs["query_filter"] = query_filter

        try:
            if hasattr(self.client, "query_points"):
                return self.client.query_points(query=list(query_vector), **kwargs)
            if hasattr(self.client, "search"):
                return self.client.search(query_vector=list(query_vector), **kwargs)
        except Exception as exc:  # pragma: no cover - network/runtime specific
            message = self._connection_error_message()
            raise RuntimeError(message) from exc

        raise AttributeError("QdrantClient does not expose query_points or search")

    def upsert_embeddings(self, records: Iterable[EmbeddedLegalRecord]) -> int:
        materialized = list(records)
        if not materialized:
            return 0
        vector_size = len(materialized[0].embedding)
        self.ensure_collection(vector_size)
        models = self._models
        points = [
            models.PointStruct(
                id=record.record.id,
                vector=record.embedding,
                payload=record.to_payload(),
            )
            for record in materialized
        ]
        try:
            self.client.upsert(collection_name=self.config.collection_name, points=points)
        except Exception as exc:  # pragma: no cover - network/runtime specific
            raise RuntimeError(self._connection_error_message()) from exc
        return len(points)

    def search(self, query_vector: Sequence[float], *, limit: int = 20, query_filter: Any | None = None) -> list[LegalRetrievalResult]:
        hits = self._search_points(query_vector, limit=limit, query_filter=query_filter)
        points = getattr(hits, "points", hits)
        results: list[LegalRetrievalResult] = []
        for hit in points:
            payload = hit.payload or {}
            record = LegalSectionRecord.model_validate(payload)
            results.append(
                LegalRetrievalResult(
                    record=record,
                    retrieval_score=float(hit.score or 0.0),
                    rerank_score=float(hit.score or 0.0),
                )
            )
        return results

    def fetch_sections(self, act: str, serial_numbers: Iterable[str]) -> list[LegalSectionRecord]:
        models = self._models
        unique_serials = []
        seen: set[str] = set()
        for serial in serial_numbers:
            normalized = str(serial).strip()
            if normalized and normalized not in seen:
                seen.add(normalized)
                unique_serials.append(normalized)

        records: list[LegalSectionRecord] = []
        for serial in unique_serials:
            result = self.client.scroll(
                collection_name=self.config.collection_name,
                scroll_filter=models.Filter(
                    must=[
                        models.FieldCondition(key="act", match=models.MatchValue(value=act)),
                        models.FieldCondition(key="serial_number", match=models.MatchValue(value=serial)),
                    ]
                ),
                limit=1,
                with_payload=True,
            )
            # qdrant-client versions vary in scroll return shape; keep the parsing defensive.
            points = result[0]
            if not points:
                continue
            payload = points[0].payload or {}
            records.append(LegalSectionRecord.model_validate(payload))
        return records
