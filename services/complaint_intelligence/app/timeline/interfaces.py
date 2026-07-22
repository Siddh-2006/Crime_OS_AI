"""
Deterministic Timeline Engine interfaces — M10.

Business logic depends ONLY on these abstract interfaces.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from app.schemas.fusion import InvestigationContext
from app.schemas.timeline import ParsedDateTime, Timeline, TimelineEntry


class ITimestampNormalizer(ABC):
    """Parses raw text timestamps deterministically into ParsedDateTime models."""

    @abstractmethod
    def parse(self, raw_timestamp: str | None) -> ParsedDateTime:
        """
        Parse raw date/time string into a normalized ParsedDateTime.
        Returns ParsedDateTime(precision=UNPARSED) if string cannot be parsed.
        Must NEVER use an LLM.
        """
        ...


class ITimelineDeduplicator(ABC):
    """Deduplicates overlapping timeline entries."""

    @abstractmethod
    def deduplicate(self, entries: list[TimelineEntry]) -> list[TimelineEntry]:
        """Deduplicate timeline entries with identical timestamps and actions."""
        ...


class ITimelineEngine(ABC):
    """Orchestrates timeline construction from an InvestigationContext."""

    @abstractmethod
    def build(self, context: InvestigationContext) -> Timeline:
        """
        Build a chronologically ordered Timeline from an InvestigationContext.
        Must NEVER use an LLM.
        """
        ...
