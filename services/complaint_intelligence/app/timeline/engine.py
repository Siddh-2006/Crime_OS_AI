"""
Deterministic Timeline Engine - M10.
Builds timeline structure from entities and events.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class TimelineResult:
    """Result of timeline construction."""
    succeeded: bool
    timeline_events: list[Any] = None
    timeline_count: int = 0
    error: str | None = None


class DeterministicTimelineEngine:
    """Builds timelines from temporal events."""
    
    def __init__(self, normalizer: Any, deduplicator: Any):
        """Initialize timeline engine."""
        self.normalizer = normalizer
        self.deduplicator = deduplicator
    
    async def build(self, investigation_context: Any) -> TimelineResult:
        """
        Build timeline from investigation context.
        
        Args:
            investigation_context: Context with entities, events, and relationships
            
        Returns:
            TimelineResult with constructed timeline
        """
        try:
            # Extract temporal events
            temporal_events = investigation_context.temporal_events or []
            
            # Normalize timestamps
            normalized = await self.normalizer.normalize(temporal_events)
            
            # Deduplicate
            deduplicated = await self.deduplicator.deduplicate(normalized)
            
            return TimelineResult(
                succeeded=True,
                timeline_events=deduplicated,
                timeline_count=len(deduplicated),
            )
        except Exception as e:
            return TimelineResult(
                succeeded=False,
                error=str(e)
            )
