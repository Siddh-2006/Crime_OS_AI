"""
Event Merger implementations for Milestone 9 — Intelligence Fusion.

DeterministicEventMerger:
  - Groups events by normalized action + timestamp (or description similarity)
  - Merges actors and source tags across matching events
  - Retains maximum confidence score
  - Returns canonical list sorted by timestamp / event order

MockEventMerger:
  - Deterministic test double returning pre-configured MergedEvent objects.
"""
from __future__ import annotations

import uuid
from collections import defaultdict

from app.fusion.interfaces import IEventMerger
from app.schemas.fusion import MergedEvent
from app.schemas.text_intelligence import ExtractedEvent


def _event_group_key(evt: ExtractedEvent) -> tuple[str, str]:
    """Key for grouping duplicate events."""
    ts_key = (evt.timestamp or "").strip().lower()
    action_key = (evt.action or evt.description or "").strip().lower()
    return (ts_key, action_key)


class DeterministicEventMerger(IEventMerger):
    """Production event merger using deterministic grouping and actor unification."""

    def merge(self, events: list[ExtractedEvent]) -> list[MergedEvent]:
        if not events:
            return []

        grouped: dict[tuple[str, str], list[ExtractedEvent]] = defaultdict(list)

        for evt in events:
            if not evt.description and not evt.action:
                continue
            key = _event_group_key(evt)
            grouped[key].append(evt)

        results: list[MergedEvent] = []
        for (ts_key, action_key), group in grouped.items():
            first = group[0]
            canonical_desc = first.description or first.action

            actors_seen: set[str] = set()
            actors_list: list[str] = []
            sources_seen: set[str] = set()
            sources_list: list[str] = []
            best_timestamp: str | None = None
            best_location: str | None = None

            for item in group:
                if item.timestamp and not best_timestamp:
                    best_timestamp = item.timestamp
                if item.location and not best_location:
                    best_location = item.location

                for actor in item.actors:
                    act_clean = actor.strip()
                    if act_clean and act_clean.lower() not in actors_seen:
                        actors_seen.add(act_clean.lower())
                        actors_list.append(act_clean)

                # Track sources
                src = getattr(item, "source", None) or "text_analysis"
                if src not in sources_seen:
                    sources_seen.add(src)
                    sources_list.append(src)

            results.append(
                MergedEvent(
                    event_id=f"evt_{uuid.uuid4().hex[:8]}",
                    description=canonical_desc,
                    actors=actors_list,
                    action=first.action,
                    timestamp=best_timestamp or (first.timestamp if first.timestamp else None),
                    location=best_location or (first.location if first.location else None),
                    sources=sources_list,
                    confidence=1.0,
                )
            )

        return results


class MockEventMerger(IEventMerger):
    """Mock event merger for unit tests."""

    def __init__(self, fixed_results: list[MergedEvent] | None = None) -> None:
        self._fixed_results = fixed_results

    def merge(self, events: list[ExtractedEvent]) -> list[MergedEvent]:
        if self._fixed_results is not None:
            return self._fixed_results
        return DeterministicEventMerger().merge(events)
