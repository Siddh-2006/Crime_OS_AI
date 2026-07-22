"""
PassthroughEntityLinker — stub IEntityLinker for future milestone.

Returns entities unchanged. Exists so the pipeline always wires a
linker without conditional None-checks. Replaced in a future milestone
with a real knowledge-base linker.
"""
from __future__ import annotations

from app.schemas.text_intelligence import ExtractedEntity
from app.text_intelligence.interfaces import IEntityLinker


class PassthroughEntityLinker(IEntityLinker):
    """No-op entity linker — returns entities unchanged."""

    async def link(self, entities: list[ExtractedEntity]) -> list[ExtractedEntity]:
        return list(entities)
