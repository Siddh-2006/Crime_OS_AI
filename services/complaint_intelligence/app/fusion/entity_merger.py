"""
Deterministic Entity Merger - merges duplicate/similar entities.
"""
from __future__ import annotations

from typing import Any


class DeterministicEntityMerger:
    """Merges entities using deterministic deduplication."""
    
    async def merge(self, entities: list[Any]) -> list[Any]:
        """
        Merge duplicate entities.
        
        Args:
            entities: List of entities to merge
            
        Returns:
            Deduplicated entities list
        """
        if not entities:
            return []
        
        try:
            # Simple deduplication by text
            seen = set()
            merged = []
            
            for entity in entities:
                entity_text = getattr(entity, 'text', str(entity)).lower()
                if entity_text not in seen:
                    seen.add(entity_text)
                    merged.append(entity)
            
            return merged
        except Exception:
            return entities
