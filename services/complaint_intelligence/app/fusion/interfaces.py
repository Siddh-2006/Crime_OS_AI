"""
Intelligence Fusion interfaces — M9.

Business logic depends ONLY on these abstract interfaces.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from app.schemas.fusion import FusionInput, InvestigationContext, MergedEntity, MergedEvent
from app.schemas.text_intelligence import ExtractedEntity, ExtractedEvent


class IEntityMerger(ABC):
    """Merges and deduplicates raw extracted entities across all sources."""

    @abstractmethod
    def merge(self, entities: list[ExtractedEntity]) -> list[MergedEntity]:
        """
        Deduplicate entities by type and normalized value.
        Preserves source provenance, highest confidence, and occurrence counts.
        """
        ...


class IEventMerger(ABC):
    """Merges and deduplicates raw extracted events across all sources."""

    @abstractmethod
    def merge(self, events: list[ExtractedEvent]) -> list[MergedEvent]:
        """
        Deduplicate events by timestamp and description similarity.
        Merges actor lists and source provenance tags.
        """
        ...


class IFusionEngine(ABC):
    """Orchestrates entity merging, event merging, and context generation."""

    @abstractmethod
    def fuse(self, input_data: FusionInput) -> InvestigationContext:
        """
        Build a consolidated InvestigationContext from complaint profile,
        extracted entities, events, and evidence references.
        """
        ...
