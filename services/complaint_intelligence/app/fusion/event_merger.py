"""
Deterministic Event Merger - merges/deduplicates events.
"""
from __future__ import annotations

from typing import Any


class DeterministicEventMerger:
    """Merges events using deterministic deduplication."""
    
    async def merge(self, events: list[Any]) -> list[Any]:
        """
        Merge duplicate events.
        
        Args:
            events: List of events to merge
            
        Returns:
            Deduplicated events list
        """
        if not events:
            return []
        
        try:
            # Simple deduplication by text
            seen = set()
            merged = []
            
            for event in events:
                event_text = getattr(event, 'text', str(event)).lower()
                if event_text not in seen:
                    seen.add(event_text)
                    merged.append(event)
            
            return merged
        except Exception:
            return events
