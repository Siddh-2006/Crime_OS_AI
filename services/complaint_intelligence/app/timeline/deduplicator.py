"""
Deterministic Timeline Deduplicator — Milestone 10.

Deduplicates timeline entries sharing identical normalized ISO timestamps
and matching actions or descriptions.
"""
from __future__ import annotations

from collections import defaultdict

from app.schemas.timeline import TimelineEntry
from app.timeline.interfaces import ITimelineDeduplicator


def _dedup_key(entry: TimelineEntry) -> tuple[str, str]:
    """Key for deduplicating timeline entries."""
    iso_key = entry.parsed_time.iso_timestamp_utc or entry.raw_timestamp or "unparsed"
    act_key = (entry.action or entry.description).strip().lower()
    return (iso_key, act_key)


class DeterministicTimelineDeduplicator(ITimelineDeduplicator):
    """Deduplicates overlapping timeline entries."""

    def deduplicate(self, entries: list[TimelineEntry]) -> list[TimelineEntry]:
        if not entries:
            return []

        grouped: dict[tuple[str, str], list[TimelineEntry]] = defaultdict(list)
        for ent in entries:
            key = _dedup_key(ent)
            grouped[key].append(ent)

        results: list[TimelineEntry] = []
        for key, group in grouped.items():
            first = group[0]
            actors_seen: set[str] = set()
            actors_list: list[str] = []
            sources_seen: set[str] = set()
            sources_list: list[str] = []
            max_conf = 0.0

            for item in group:
                for act in item.actors:
                    clean_act = act.strip()
                    if clean_act and clean_act.lower() not in actors_seen:
                        actors_seen.add(clean_act.lower())
                        actors_list.append(clean_act)

                for src in item.sources:
                    if src not in sources_seen:
                        sources_seen.add(src)
                        sources_list.append(src)

                if item.confidence > max_conf:
                    max_conf = item.confidence

            # Build canonical merged entry
            merged_entry = first.model_copy(
                update={
                    "actors": actors_list,
                    "sources": sources_list,
                    "confidence": round(max_conf, 4),
                }
            )
            results.append(merged_entry)

        return results


class MockTimelineDeduplicator(ITimelineDeduplicator):
    """Mock timeline deduplicator for testing."""

    def deduplicate(self, entries: list[TimelineEntry]) -> list[TimelineEntry]:
        return DeterministicTimelineDeduplicator().deduplicate(entries)
