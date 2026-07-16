"""
LlamaCppEmbedder — wraps the llama-server /v1/embeddings endpoint.

The llama.cpp server runs nomic-embed-text-v2-moe (GGUF) locally and exposes
an OpenAI-compatible REST API. This class is a singleton that reuses a
single httpx.AsyncClient for connection pooling.

nomic-embed-text-v2-moe is an asymmetric model, so we use:
  - "search_document: "  prefix when embedding FIR documents (indexing)
  - "search_query: "     prefix when embedding complaints (querying)
"""
import time
import httpx

from app.core.config import settings
from app.core.logging import logger

# Instruction prefixes required by nomic-embed-text models
DOCUMENT_PREFIX = "search_document: "
QUERY_PREFIX = "search_query: "


class LlamaCppEmbedder:
    """
    Async embedder backed by llama-server.
    Instantiate once; reuse the same httpx client for all requests.
    """

    def __init__(self) -> None:
        self._client = httpx.AsyncClient(
            base_url=settings.LLAMA_CPP_URL,
            timeout=settings.EMBEDDING_TIMEOUT_SECONDS,
            headers={"Content-Type": "application/json"},
        )
        logger.info(
            "LlamaCppEmbedder initialised",
            extra={
                "llama_cpp_url": settings.LLAMA_CPP_URL,
                "model": settings.EMBEDDING_MODEL,
            },
        )

    async def embed_document(self, text: str) -> list[float]:
        """
        Embed a closed-FIR document for indexing into Qdrant.
        Applies the 'search_document' instruction prefix.
        """
        return await self._embed(DOCUMENT_PREFIX + text, label="document")

    async def embed_query(self, text: str) -> list[float]:
        """
        Embed an open complaint for retrieval (query-side).
        Applies the 'search_query' instruction prefix.
        """
        return await self._embed(QUERY_PREFIX + text, label="query")

    async def _embed(self, text: str, label: str) -> list[float]:
        t0 = time.perf_counter()
        try:
            response = await self._client.post(
                "/v1/embeddings",
                json={"model": settings.EMBEDDING_MODEL, "input": text},
            )
            response.raise_for_status()
            data = response.json()
            vector: list[float] = data["data"][0]["embedding"]

            latency_ms = round((time.perf_counter() - t0) * 1000, 2)
            logger.info(
                "Embedding generated",
                extra={
                    "type": label,
                    "dim": len(vector),
                    "latency_ms": latency_ms,
                },
            )
            return vector

        except httpx.HTTPStatusError as exc:
            logger.error(
                "llama-server HTTP error",
                extra={"status": exc.response.status_code, "body": exc.response.text},
            )
            raise
        except Exception as exc:
            logger.error("Embedding request failed", extra={"error": str(exc)})
            raise

    async def close(self) -> None:
        await self._client.aclose()


# ── Module-level singleton ────────────────────────────────────────────────────
embedder = LlamaCppEmbedder()
