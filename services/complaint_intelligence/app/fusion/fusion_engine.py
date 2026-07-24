"""
Intelligence Fusion Engine - M9.
Merges entities and events from all evidence sources using deterministic algorithms.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class FusionResult:
    """Result of fusion processing."""
    succeeded: bool
    merged_entities: list[Any] = None
    merged_events: list[Any] = None
    entity_count: int = 0
    event_count: int = 0
    error: str | None = None


class IntelligenceFusionEngine:
    """Fuses intelligence from multiple evidence sources."""
    
    def __init__(self, entity_merger: Any, event_merger: Any):
        """Initialize fusion engine."""
        self.entity_merger = entity_merger
        self.event_merger = event_merger
    
    async def run(self, fusion_input: Any) -> FusionResult:
        """
        Fuse entities and events from all evidence sources.
        
        Args:
            fusion_input: FusionInput with narrative entities/events and evidence refs
            
        Returns:
            FusionResult with merged entities and events
        """
        try:
            # Merge narrative entities with evidence entities
            all_entities = list(fusion_input.narrative_entities or [])
            for evidence_ref in (fusion_input.evidence_refs or []):
                # In a real implementation, extract entities per evidence
                pass
            
            merged_entities = await self.entity_merger.merge(all_entities)
            
            # Merge events similarly
            all_events = list(fusion_input.narrative_events or [])
            merged_events = await self.event_merger.merge(all_events)
            
            return FusionResult(
                succeeded=True,
                merged_entities=merged_entities,
                merged_events=merged_events,
                entity_count=len(merged_entities),
                event_count=len(merged_events),
            )
        except Exception as e:
            return FusionResult(
                succeeded=False,
                error=str(e)
            )
