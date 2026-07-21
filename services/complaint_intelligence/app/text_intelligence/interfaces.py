"""
Interfaces for the Text Intelligence Pipeline.

Business logic depends ONLY on these ABCs — never on concrete
implementations (spaCy, regex, etc.). This ensures AI models
can be swapped without touching any downstream code.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from app.schemas.text_intelligence import ExtractedEntity, ExtractedEvent


class INERExtractor(ABC):
    """Extract named entities (PERSON, ORG, GPE, etc.) from English text."""

    @abstractmethod
    async def extract(self, text: str) -> list[ExtractedEntity]:
        """Return a list of named entities found in *text*."""
        ...


class IRegexExtractor(ABC):
    """Extract investigation-relevant entities using deterministic patterns."""

    @abstractmethod
    async def extract(self, text: str) -> list[ExtractedEntity]:
        """Return a list of regex-matched entities from *text*."""
        ...


class IEventExtractor(ABC):
    """Extract structured temporal events from text + entity context."""

    @abstractmethod
    async def extract(
        self, text: str, entities: list[ExtractedEntity]
    ) -> list[ExtractedEvent]:
        """Return a list of structured events from *text*."""
        ...


class IEntityLinker(ABC):
    """
    Link extracted entities to external knowledge bases.
    Stub interface — implemented in a future milestone.
    """

    @abstractmethod
    async def link(
        self, entities: list[ExtractedEntity]
    ) -> list[ExtractedEntity]:
        """Enrich entities with external links. Returns entities unchanged if no linker is available."""
        ...
