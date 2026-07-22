"""
Deterministic Timeline Engine — Milestone 10 Orchestrator.

Ingests InvestigationContext, normalizes timestamps without an LLM,
deduplicates entries, and sorts them chronologically.
"""
from __future__ import annotations

import time
import uuid

from app.core.logging import logger
from app.schemas.fusion import InvestigationContext
from app.schemas.timeline import ParsedDateTime, Timeline, TimelineEntry, TimestampPrecision
from app.timeline.interfaces import ITimelineDeduplicator, ITimestampNormalizer, ITimelineEngine


class DeterministicTimelineEngine(ITimelineEngine):
    """
    Production Timeline Engine.
    100% Deterministic — NEVER calls an LLM.

    Dependencies:
      - normalizer   : ITimestampNormalizer
      - deduplicator : ITimelineDeduplicator
    """

    def __init__(
        self,
        normalizer: ITimestampNormalizer,
        deduplicator: ITimelineDeduplicator,
    ) -> None:
        self._normalizer = normalizer
        self._deduplicator = deduplicator

    def build(self, context: InvestigationContext) -> Timeline:
        t0 = time.monotonic()
        timeline_id = f"tl_{uuid.uuid4().hex[:12]}"

        logger.info(
            "[timeline_engine] Building timeline",
            extra={"timeline_id": timeline_id, "context_id": context.context_id, "events_count": len(context.events)},
        )

        raw_entries: list[TimelineEntry] = []
        unparsed_count = 0

        # ── 1. Create entry for each MergedEvent ─────────────────────────────
        for evt in context.events:
            parsed_time = self._normalizer.parse(evt.timestamp)
            if parsed_time.precision == TimestampPrecision.UNPARSED:
                unparsed_count += 1

            entry = TimelineEntry(
                entry_id=f"entry_{uuid.uuid4().hex[:8]}",
                event_id=evt.event_id,
                description=evt.description,
                actors=evt.actors,
                action=evt.action,
                raw_timestamp=evt.timestamp,
                parsed_time=parsed_time,
                location=evt.location,
                sources=evt.sources,
                confidence=evt.confidence,
            )
            raw_entries.append(entry)

        # ── 2. Deduplicate timeline entries ───────────────────────────────────
        deduped_entries = self._deduplicator.deduplicate(raw_entries)

        # ── 3. Chronological Sort ─────────────────────────────────────────────
        # Primary key: (has_iso, iso_timestamp_utc)
        # Entries with valid ISO timestamp come first in ascending order.
        # Entries without valid ISO timestamp come last.
        def _sort_key(entry: TimelineEntry) -> tuple[int, str]:
            iso = entry.parsed_time.iso_timestamp_utc
            if iso:
                return (0, iso)
            return (1, entry.raw_timestamp or "")

        sorted_entries = sorted(deduped_entries, key=_sort_key)

        # ── 4. Calculate timeline bounds ──────────────────────────────────────
        start_time: str | None = None
        end_time: str | None = None

        valid_timestamps = [
            e.parsed_time.iso_timestamp_utc
            for e in sorted_entries
            if e.parsed_time.iso_timestamp_utc
        ]
        if valid_timestamps:
            start_time = valid_timestamps[0]
            end_time = valid_timestamps[-1]

        duration_ms = (time.monotonic() - t0) * 1000

        logger.info(
            "[timeline_engine] Timeline building completed",
            extra={
                "timeline_id": timeline_id,
                "total_events": len(sorted_entries),
                "unparsed_count": unparsed_count,
                "start_time": start_time,
                "end_time": end_time,
                "duration_ms": round(duration_ms, 2),
            },
        )

        return Timeline(
            timeline_id=timeline_id,
            context_id=context.context_id,
            entries=sorted_entries,
            start_time=start_time,
            end_time=end_time,
            total_events=len(sorted_entries),
            unparsed_count=unparsed_count,
            processing_duration_ms=round(duration_ms, 2),
        )


class MockTimelineEngine(ITimelineEngine):
    """Mock timeline engine for testing."""

    def __init__(self, fixed_timeline: Timeline | None = None) -> None:
        self._fixed_timeline = fixed_timeline

    def build(self, context: InvestigationContext) -> Timeline:
        if self._fixed_timeline is not None:
            return self._fixed_timeline

        from app.timeline.deduplicator import DeterministicTimelineDeduplicator
        from app.timeline.normalizer import DeterministicTimestampNormalizer

        real_engine = DeterministicTimelineEngine(
            normalizer=DeterministicTimestampNormalizer(),
            deduplicator=DeterministicTimelineDeduplicator(),
        )
        return real_engine.build(context)
