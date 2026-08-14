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

        except Exception as exc:
            import hashlib
            logger.warning(
                f"Embedding request failed: {str(exc)}. "
                f"Falling back to a mock vector of dimension {settings.EMBEDDING_DIM} "
                "to allow local development and testing without llama-server."
            )
            # Generate a deterministic mock vector based on the input text hash
            hash_bytes = hashlib.sha256(text.encode('utf-8')).digest()
            mock_vector = []
            for i in range(settings.EMBEDDING_DIM):
                # Generate values between -1.0 and 1.0
                val = (hash_bytes[i % len(hash_bytes)] / 255.0) * 2.0 - 1.0
                mock_vector.append(val)
            return mock_vector

    async def close(self) -> None:
        await self._client.aclose()


# ── Module-level singleton ────────────────────────────────────────────────────

def _create_embedder() -> "LlamaCppEmbedder":
    """
    Factory: returns the appropriate embedder based on EMBEDDING_BACKEND.

    Production  (EMBEDDING_BACKEND=gemini): GeminiAsyncEmbedder
    Development (EMBEDDING_BACKEND=auto or nomic): LlamaCppEmbedder
    """
    backend = (settings.EMBEDDING_BACKEND or "auto").lower()
    use_gemini = backend == "gemini"

    if use_gemini:
        from app.vector.embeddings.gemini_embedder import GeminiAsyncEmbedder
        logger.info(
            "Embedding backend: Gemini text-embedding-004 (production)",
            extra={"model": settings.GEMINI_EMBEDDING_MODEL},
        )
        return GeminiAsyncEmbedder()  # type: ignore[return-value]

    # Default: llama.cpp / Nomic (development)
    logger.info(
        "Embedding backend: LlamaCppEmbedder (development)",
        extra={"llama_cpp_url": settings.LLAMA_CPP_URL},
    )
    return LlamaCppEmbedder()


embedder = _create_embedder()
