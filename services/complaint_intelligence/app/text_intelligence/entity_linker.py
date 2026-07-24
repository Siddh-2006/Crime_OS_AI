"""
Entity linking component for connecting extracted entities to knowledge bases.
Passthrough version for now - can be extended later.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class LinkedEntity:
    """Represents a linked entity with metadata."""
    text: str
    entity_type: str
    knowledge_base_id: str | None = None
    confidence: float = 0.0


class PassthroughEntityLinker:
    """Simple passthrough entity linker."""
    
    async def link(self, entities: list[Any]) -> list[LinkedEntity]:
        """
        Link entities to knowledge bases.
        
        Args:
            entities: List of entities to link
            
        Returns:
            List of linked entities
        """
        linked = []
        
        try:
            for entity in entities:
                linked.append(
                    LinkedEntity(
                        text=getattr(entity, 'text', str(entity)),
                        entity_type=getattr(entity, 'label', 'UNKNOWN'),
                        knowledge_base_id=None,
                        confidence=0.0
                    )
                )
        except Exception:
            pass
        
        return linked
