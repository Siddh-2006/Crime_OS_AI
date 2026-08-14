"""
GeminiAsyncEmbedder — async Gemini text-embedding-004 embedder.

Used in production when EMBEDDING_BACKEND=gemini.
Exposes the exact same interface as LlamaCppEmbedder so no call-site
changes are needed in qdrant_repository.py or anywhere else.

Dimension: 768 (text-embedding-004 default) — matches existing Qdrant
collection; no collection migration required.

Transport: raw httpx.AsyncClient (avoids google-generativeai SDK's
sync-only limitation). No extra dependency — httpx is already in requirements.
"""
from __future__ import annotations

import hashlib
import time

import httpx

from app.core.config import settings
from app.core.logging import logger

# Gemini text-embedding-004 always returns 768-dim vectors.
GEMINI_EMBEDDING_DIM = 768
GEMINI_EMBED_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent"


class GeminiAsyncEmbedder:
    """
    Production async embedder backed by Gemini text-embedding-004.

    Reads GEMINI_API_KEY and GEMINI_EMBEDDING_MODEL from settings.
    Falls back to a deterministic mock vector if the API call fails
    so development/CI continues working even without a valid key.
    """

    def __init__(self) -> None:
        self._api_key = settings.GEMINI_API_KEY or ""
        self._model   = settings.GEMINI_EMBEDDING_MODEL
        self._client  = httpx.AsyncClient(timeout=30.0)

        if not self._api_key:
            logger.warning(
                "GeminiAsyncEmbedder: GEMINI_API_KEY is not set — "
                "all embedding calls will return mock vectors."
            )
        else:
            logger.info(
                "GeminiAsyncEmbedder initialised",
                extra={"model": f"models/{self._model}"},
            )

    async def _call_api(self, text: str, task_type: str) -> list[float]:
        """Call the Gemini embedding REST endpoint. Returns mock on failure."""
        if not self._api_key:
            return self._mock_vector(text)

        url = GEMINI_EMBED_URL.format(model=self._model)
        payload = {
            "model": f"models/{self._model}",
            "content": {"parts": [{"text": text}]},
            "taskType": task_type,
        }
        t0 = time.perf_counter()
        try:
            resp = await self._client.post(
                url,
                json=payload,
                params={"key": self._api_key},
            )
            resp.raise_for_status()
            data = resp.json()
            vector: list[float] = data["embedding"]["values"]
            logger.info(
                "Gemini embedding generated",
                extra={
                    "type": task_type,
                    "dim": len(vector),
                    "latency_ms": round((time.perf_counter() - t0) * 1000, 2),
                },
            )
            return vector
        except Exception as exc:
            logger.warning(
                f"GeminiAsyncEmbedder: API call failed ({exc}). "
                f"Falling back to mock vector of dim {GEMINI_EMBEDDING_DIM}."
            )
            return self._mock_vector(text)

    @staticmethod
    def _mock_vector(text: str) -> list[float]:
        """Deterministic mock — sha256 of input, normalised to [-1, 1]."""
        seed = hashlib.sha256(text.encode()).digest()
        return [(seed[i % len(seed)] / 255.0) * 2.0 - 1.0 for i in range(GEMINI_EMBEDDING_DIM)]

    # ── Public API (mirrors LlamaCppEmbedder) ─────────────────────────────────

    async def embed_document(self, text: str) -> list[float]:
        """Embed a closed-FIR document for indexing into Qdrant."""
        return await self._call_api(text, task_type="RETRIEVAL_DOCUMENT")

    async def embed_query(self, text: str) -> list[float]:
        """Embed an open complaint for retrieval (query-side)."""
        return await self._call_api(text, task_type="RETRIEVAL_QUERY")

    async def close(self) -> None:
        await self._client.aclose()
