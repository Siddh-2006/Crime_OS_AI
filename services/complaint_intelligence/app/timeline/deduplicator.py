"""
Deterministic Timeline Deduplicator.
Removes duplicate timeline events.
"""
from __future__ import annotations

from typing import Any


class DeterministicTimelineDeduplicator:
    """Deduplicates timeline events."""
    
    async def deduplicate(self, events: list[Any]) -> list[Any]:
        """
        Remove duplicate events from timeline.
        
        Args:
            events: List of timeline events
            
        Returns:
            Deduplicated timeline events
        """
        if not events:
            return []
        
        try:
            seen = set()
            deduplicated = []
            
            for event in events:
                event_key = str(getattr(event, 'text', event)).lower()
                if event_key not in seen:
                    seen.add(event_key)
                    deduplicated.append(event)
            
            return deduplicated
        except Exception:
            return events
