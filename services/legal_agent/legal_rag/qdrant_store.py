from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

from .models import EmbeddedDocumentRecord, LegalRetrievalResult, RetrievedDocumentRecord

# Load .env from the legal_agent root (two levels up from this file)
def _load_dotenv() -> None:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    with env_path.open() as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip()
            if key and key not in os.environ:
                os.environ[key] = value

_load_dotenv()


def _load_qdrant():
    try:
        from qdrant_client import QdrantClient, models
    except Exception as exc:  # pragma: no cover - dependency missing
        raise RuntimeError("qdrant-client is required for vector storage and retrieval.") from exc
    return QdrantClient, models


def _extract_scroll_result(result: Any) -> tuple[list[Any], Any | None]:
    points = getattr(result, "points", None)
    next_offset = getattr(result, "next_page_offset", None)
    if points is None:
        if isinstance(result, tuple):
            points = result[0] if result else []
            if len(result) > 1:
                next_offset = result[1]
        else:
            points = result or []
    return list(points or []), next_offset


@dataclass(slots=True)
class LegalQdrantConfig:
    url: str | None = None
    path: str | None = "./qdrant_local_storage"
    collection_name: str = "light"
    api_key: str | None = None          # Set for Qdrant Cloud; leave empty for local
    prefer_grpc: bool = False
    timeout: float | None = 70.0


def _default_config() -> LegalQdrantConfig:
    """Build a LegalQdrantConfig from environment variables, with sensible defaults."""
    import os
    url = os.environ.get("QDRANT_URL") or None
    api_key = os.environ.get("QDRANT_API_KEY") or None
    collection = os.environ.get("QDRANT_COLLECTION") or "crime_os"
    return LegalQdrantConfig(url=url, api_key=api_key, collection_name=collection)


class LegalQdrantStore:
    def __init__(self, config: LegalQdrantConfig | None = None) -> None:
        self.config = config if config is not None else _default_config()
        QdrantClient, models = _load_qdrant()
        if self.config.url:
            kwargs: dict = {
                "url": self.config.url,
                "prefer_grpc": self.config.prefer_grpc,
                "timeout": self.config.timeout,
            }
            if self.config.api_key:
                kwargs["api_key"] = self.config.api_key
            self._client = QdrantClient(**kwargs)
        else:
            self._client = QdrantClient(
                path=self.config.path,
                timeout=self.config.timeout,
            )

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

    @staticmethod
    def _format_qdrant_exception(exc: Exception) -> str:
        return f"{type(exc).__name__}: {exc}"

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
            message = f"{self._connection_error_message()} ({self._format_qdrant_exception(exc)})"
            raise RuntimeError(message) from exc

        raise AttributeError("QdrantClient does not expose query_points or search")

    def upsert_embeddings(self, records: Iterable[EmbeddedDocumentRecord]) -> int:
        materialized = list(records)
        if not materialized:
            return 0
        vector_size = len(materialized[0].embedding)
        self.ensure_collection(vector_size)
        models = self._models
        points = [
            models.PointStruct(
                id=record.uuid,
                vector=record.embedding,
                payload=record.to_payload(),
            )
            for record in materialized
        ]
        try:
            self.client.upsert(collection_name=self.config.collection_name, points=points)
        except Exception as exc:  # pragma: no cover - network/runtime specific
            message = f"{self._connection_error_message()} ({self._format_qdrant_exception(exc)})"
            raise RuntimeError(message) from exc
        return len(points)

    def upsert_single(self, record: EmbeddedDocumentRecord) -> str:
        """Upsert one record into Qdrant. Returns the point UUID."""
        self.upsert_embeddings([record])
        return record.uuid

    def delete_by_uuid(self, uuid: str) -> None:
        """Delete a single Qdrant point by its UUID."""
        models = self._models
        try:
            self.client.delete(
                collection_name=self.config.collection_name,
                points_selector=models.PointIdsList(points=[uuid]),
            )
        except Exception as exc:
            message = f"{self._connection_error_message()} ({self._format_qdrant_exception(exc)})"
            raise RuntimeError(message) from exc

    def list_documents(self, *, batch_size: int = 256) -> list[RetrievedDocumentRecord]:
        documents: list[RetrievedDocumentRecord] = []
        offset = None
        while True:
            try:
                result = self.client.scroll(
                    collection_name=self.config.collection_name,
                    limit=batch_size,
                    offset=offset,
                    with_payload=True,
                )
            except Exception as exc:  # pragma: no cover - network/runtime specific
                message = f"{self._connection_error_message()} ({self._format_qdrant_exception(exc)})"
                raise RuntimeError(message) from exc

            points, next_offset = _extract_scroll_result(result)
            if not points:
                break

            for point in points:
                payload = point.payload or {}
                documents.append(RetrievedDocumentRecord.from_payload(payload))

            if next_offset is None:
                break
            offset = next_offset
        return documents

    def list_sections(self, *, batch_size: int = 256) -> list[RetrievedDocumentRecord]:
        return self.list_documents(batch_size=batch_size)

    def search(self, query_vector: Sequence[float], *, limit: int = 20, query_filter: Any | None = None) -> list[LegalRetrievalResult]:
        hits = self._search_points(query_vector, limit=limit, query_filter=query_filter)
        points = getattr(hits, "points", hits)
        results: list[LegalRetrievalResult] = []
        for hit in points:
            payload = hit.payload or {}
            record = RetrievedDocumentRecord.from_payload(payload)
            results.append(
                LegalRetrievalResult(
                    record=record,
                    retrieval_score=float(hit.score or 0.0),
                    rerank_score=float(hit.score or 0.0),
                )
            )
        return results

    def fetch_sections(self, act: str, serial_numbers: Iterable[str]) -> list[RetrievedDocumentRecord]:
        unique_ids: list[str] = []
        seen: set[str] = set()
        for serial in serial_numbers:
            normalized = str(serial).strip()
            if normalized and normalized not in seen:
                seen.add(normalized)
                unique_ids.append(normalized)

        if not unique_ids:
            return []

        records: list[RetrievedDocumentRecord] = []
        models = self._models
        for serial_number in unique_ids:
            try:
                result = self.client.scroll(
                    collection_name=self.config.collection_name,
                    scroll_filter=models.Filter(
                        must=[
                            models.FieldCondition(
                                key="act",
                                match=models.MatchValue(value=act),
                            ),
                            models.FieldCondition(
                                key="serial_number",
                                match=models.MatchValue(value=serial_number),
                            ),
                        ]
                    ),
                    limit=1,
                    with_payload=True,
                )
            except Exception as exc:  # pragma: no cover - network/runtime specific
                message = f"{self._connection_error_message()} ({self._format_qdrant_exception(exc)})"
                raise RuntimeError(message) from exc

            points, _ = _extract_scroll_result(result)
            for point in points:
                payload = point.payload or {}
                records.append(RetrievedDocumentRecord.from_payload(payload))
        return records
