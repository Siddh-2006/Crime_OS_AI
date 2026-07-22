"""
Intelligence Fusion Engine — Milestone 9 Orchestrator.

Combines complaint profiles with multi-source evidence outputs, merges entities
and events via injected IEntityMerger and IEventMerger, and generates a
complete InvestigationContext.
"""
from __future__ import annotations

import time
import uuid

from app.core.logging import logger
from app.fusion.interfaces import IEntityMerger, IEventMerger, IFusionEngine
from app.schemas.fusion import FusionInput, InvestigationContext


class IntelligenceFusionEngine(IFusionEngine):
    """
    Production Intelligence Fusion engine.

    Dependencies:
      - entity_merger : IEntityMerger
      - event_merger  : IEventMerger
    """

    def __init__(
        self,
        entity_merger: IEntityMerger,
        event_merger: IEventMerger,
    ) -> None:
        self._entity_merger = entity_merger
        self._event_merger = event_merger

    def fuse(self, input_data: FusionInput) -> InvestigationContext:
        t0 = time.monotonic()
        context_id = f"ctx_{uuid.uuid4().hex[:12]}"

        logger.info(
            "[fusion_engine] Starting Intelligence Fusion",
            extra={
                "context_id": context_id,
                "input_entities_count": len(input_data.entities),
                "input_events_count": len(input_data.events),
                "evidence_sources_count": len(input_data.evidence_references),
            },
        )

        # ── 1. Merge entities ────────────────────────────────────────────────
        merged_entities = self._entity_merger.merge(input_data.entities)

        # ── 2. Merge events ──────────────────────────────────────────────────
        merged_events = self._event_merger.merge(input_data.events)

        duration_ms = (time.monotonic() - t0) * 1000

        logger.info(
            "[fusion_engine] Intelligence Fusion completed",
            extra={
                "context_id": context_id,
                "fused_entities_count": len(merged_entities),
                "fused_events_count": len(merged_events),
                "duration_ms": round(duration_ms, 2),
            },
        )

        return InvestigationContext(
            context_id=context_id,
            complaint_profile=input_data.complaint_profile,
            entities=merged_entities,
            events=merged_events,
            evidence_sources=input_data.evidence_references,
            total_entities_fused=len(merged_entities),
            total_events_fused=len(merged_events),
            processing_duration_ms=round(duration_ms, 2),
        )


class MockFusionEngine(IFusionEngine):
    """Mock fusion engine for tests."""

    def __init__(self, fixed_context: InvestigationContext | None = None) -> None:
        self._fixed_context = fixed_context

    def fuse(self, input_data: FusionInput) -> InvestigationContext:
        if self._fixed_context is not None:
            return self._fixed_context
        # Default fallback using real IntelligenceFusionEngine with default mergers
        from app.fusion.entity_merger import DeterministicEntityMerger
        from app.fusion.event_merger import DeterministicEventMerger

        real_engine = IntelligenceFusionEngine(
            entity_merger=DeterministicEntityMerger(),
            event_merger=DeterministicEventMerger(),
        )
        return real_engine.fuse(input_data)
