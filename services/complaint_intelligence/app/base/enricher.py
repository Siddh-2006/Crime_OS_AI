"""
BaseEnricher — abstract contract for AI model enrichers.

An Enricher wraps a single AI model or external service call.
It receives a typed Input, calls the model through an interface,
validates the raw response into a typed Output schema, and returns it.

Business logic NEVER depends on concrete model implementations.
All model calls go through an IModelClient interface so the model
can be swapped without changing the enricher or downstream code.
"""
from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Generic, TypeVar

from app.core.logging import logger

InputT = TypeVar("InputT")
OutputT = TypeVar("OutputT")


@dataclass
class EnrichmentResult(Generic[OutputT]):
    output: OutputT
    model_used: str
    duration_ms: float
    from_cache: bool = False
    raw_response: Any = None     # kept for audit; never passed downstream

    def to_dict(self) -> dict:
        return {
            "model_used": self.model_used,
            "duration_ms": round(self.duration_ms, 2),
            "from_cache": self.from_cache,
        }


class BaseEnricher(ABC, Generic[InputT, OutputT]):
    """
    Abstract enricher.

    Subclasses implement:
        enrich(input_data) -> OutputT

    The run() wrapper handles:
        - timing
        - cache check (via _cache_key / _from_cache / _store_cache hooks)
        - structured logging
        - raw response capture for audit
    """

    enricher_name: str = "base_enricher"
    model_name: str = "unknown"

    async def run(self, input_data: InputT) -> EnrichmentResult[OutputT]:
        t0 = time.perf_counter()

        # Cache lookup (no-op unless subclass overrides)
        cache_key = self._cache_key(input_data)
        if cache_key:
            cached = await self._from_cache(cache_key)
            if cached is not None:
                logger.debug(
                    f"[{self.enricher_name}] Cache hit",
                    extra={"enricher": self.enricher_name, "cache_key": cache_key},
                )
                return EnrichmentResult(
                    output=cached,
                    model_used=self.model_name,
                    duration_ms=(time.perf_counter() - t0) * 1000,
                    from_cache=True,
                )

        logger.debug(
            f"[{self.enricher_name}] Calling model",
            extra={"enricher": self.enricher_name, "model": self.model_name},
        )

        output = await self.enrich(input_data)
        duration_ms = (time.perf_counter() - t0) * 1000

        if cache_key:
            await self._store_cache(cache_key, output)

        logger.info(
            f"[{self.enricher_name}] Enrichment complete",
            extra={
                "enricher": self.enricher_name,
                "model": self.model_name,
                "duration_ms": round(duration_ms, 2),
            },
        )

        return EnrichmentResult(
            output=output,
            model_used=self.model_name,
            duration_ms=duration_ms,
            from_cache=False,
        )

    @abstractmethod
    async def enrich(self, input_data: InputT) -> OutputT:
        """
        Call the underlying model and return a strongly-typed Output.
        Never return raw AI response strings to callers.
        """
        ...

    # ── Cache hooks (override in subclass to enable caching) ─────────────────

    def _cache_key(self, input_data: InputT) -> str | None:
        """Return a cache key string, or None to disable caching."""
        return None

    async def _from_cache(self, key: str) -> OutputT | None:
        """Look up a previously cached result. Return None on miss."""
        return None

    async def _store_cache(self, key: str, output: OutputT) -> None:
        """Persist output to cache."""
        pass
