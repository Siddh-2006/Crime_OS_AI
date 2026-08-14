"""
GeminiEmbedder — synchronous Gemini text-embedding-004 embedder.

Uses raw httpx.Client (already in requirements.txt) — no google-generativeai
SDK needed. Mirrors the same REST call as GeminiAsyncEmbedder in io-recommendation.

Used in production when EMBEDDING_BACKEND=gemini (or APP_ENV=production with EMBEDDING_BACKEND=auto).
Exposes the exact same interface as BGEEmbedder / NomicEmbedder.

Dimension: 768 (text-embedding-004 default) — matches existing Qdrant
collection; no migration required.

REST endpoint:
  POST https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent
  ?key=<GEMINI_API_KEY>
  Body: { "model": "models/text-embedding-004", "content": {"parts": [{"text": "..."}]}, "taskType": "..." }
  Response: { "embedding": { "values": [...] } }
"""
from __future__ import annotations

import hashlib
import os
import sys
import time
from typing import TYPE_CHECKING, Iterable, Sequence

import httpx

if TYPE_CHECKING:
    from .models import EmbeddedDocumentRecord
    from ingestion.schemas import DeptRegistryRecord, LegalSectionRecord, SOPRecord
    ParsedRecord = LegalSectionRecord | DeptRegistryRecord | SOPRecord


GEMINI_EMBEDDING_DIM = 768
_EMBED_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent"


class GeminiEmbedder:
    """
    Production synchronous embedder backed by Gemini text-embedding-004.
    Uses httpx.Client — no google-generativeai SDK required.
    Falls back to a deterministic mock vector on API failure.
    """

    def __init__(self) -> None:
        self._api_key = os.environ.get("GEMINI_API_KEY", "")
        self._model   = os.environ.get("GEMINI_EMBEDDING_MODEL", "text-embedding-004")
        self._client  = httpx.Client(timeout=30.0)

        if not self._api_key:
            print(
                "[GeminiEmbedder] WARNING: GEMINI_API_KEY is not set. "
                "All embedding calls will return mock vectors.",
                file=sys.stderr,
            )
        else:
            print(
                f"[GeminiEmbedder] Initialised via httpx — model: models/{self._model}",
                file=sys.stderr,
            )

    def embedding_dimension(self) -> int:
        return GEMINI_EMBEDDING_DIM

    def _call_api(self, text: str, task_type: str, label: str = "doc") -> list[float]:
        """Single blocking REST call. Returns mock vector on any failure."""
        if not self._api_key:
            return self._mock_vector(text)

        url = _EMBED_URL.format(model=self._model)
        payload = {
            "model": f"models/{self._model}",
            "content": {"parts": [{"text": text}]},
            "taskType": task_type,
        }
        t0 = time.perf_counter()
        try:
            resp = self._client.post(url, json=payload, params={"key": self._api_key})
            resp.raise_for_status()
            vector: list[float] = resp.json()["embedding"]["values"]
            elapsed = round((time.perf_counter() - t0) * 1000, 2)
            print(
                f"[GeminiEmbedder] Embedded ({label}) in {elapsed}ms  dim={len(vector)}",
                file=sys.stderr,
            )
            return vector
        except Exception as exc:
            print(
                f"[GeminiEmbedder] WARNING: API call failed ({exc}). "
                f"Using mock vector of dim {GEMINI_EMBEDDING_DIM}.",
                file=sys.stderr,
            )
            return self._mock_vector(text)

    @staticmethod
    def _mock_vector(text: str) -> list[float]:
        seed = hashlib.sha256(text.encode()).digest()
        return [(seed[i % len(seed)] / 255.0) * 2.0 - 1.0 for i in range(GEMINI_EMBEDDING_DIM)]

    # ── Public API (mirrors BGEEmbedder / NomicEmbedder exactly) ─────────────

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        t0 = time.perf_counter()
        result = [self._call_api(t, "RETRIEVAL_DOCUMENT", label="doc") for t in texts]
        print(
            f"[GeminiEmbedder] embed_texts: {time.perf_counter() - t0:.3f}s "
            f"for {len(texts)} text(s)",
            file=sys.stderr,
        )
        return result

    def embed_query(self, query: str) -> list[float]:
        return self._call_api(query, "RETRIEVAL_QUERY", label="query")

    def embed_record(self, record: "ParsedRecord") -> "EmbeddedDocumentRecord":
        from .embedding import build_embedding_text
        from .models import EmbeddedDocumentRecord
        t0 = time.perf_counter()
        embedding_text = build_embedding_text(record)
        embedding = self._call_api(embedding_text, "RETRIEVAL_DOCUMENT", label="record")
        print(
            f"[GeminiEmbedder] embed_record: {time.perf_counter() - t0:.3f}s",
            file=sys.stderr,
        )
        return EmbeddedDocumentRecord(
            record=record,
            embedding_text=embedding_text,
            embedding=embedding,
        )

    def embed_records(self, records: "Iterable[ParsedRecord]") -> "list[EmbeddedDocumentRecord]":
        materialized = list(records)
        t0 = time.perf_counter()
        embedded = [self.embed_record(r) for r in materialized]
        print(
            f"[GeminiEmbedder] embed_records: {time.perf_counter() - t0:.3f}s "
            f"for {len(materialized)} record(s)",
            file=sys.stderr,
        )
        return embedded

    def close(self) -> None:
        self._client.close()
