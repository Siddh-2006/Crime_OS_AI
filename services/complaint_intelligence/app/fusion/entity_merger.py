"""
Entity Merger implementations for Milestone 9 — Intelligence Fusion.

DeterministicEntityMerger:
  - Groups entities by (entity_type.upper(), normalized_value)
  - Normalized value: lowercased, leading/trailing punctuation & whitespace stripped
  - Collects all distinct raw values seen
  - Collects and deduplicates source provenance tags
  - Keeps max confidence score
  - Sorts merged entities by occurrence_count DESC, then canonical_value ASC

MockEntityMerger:
  - Deterministic test double returning pre-configured MergedEntity objects.
"""
from __future__ import annotations

import re
from collections import defaultdict

from app.fusion.interfaces import IEntityMerger
from app.schemas.fusion import MergedEntity
from app.schemas.text_intelligence import ExtractedEntity

_NORMALIZE_CLEAN = re.compile(r"[\s\-_/\.]+")


def _normalize_value(val: str) -> str:
    """Normalize string for fuzzy-exact grouping (lowercase, stripped punctuation/spaces)."""
    cleaned = _NORMALIZE_CLEAN.sub("", val.strip().lower())
    return cleaned if cleaned else val.strip().lower()


class DeterministicEntityMerger(IEntityMerger):
    """Production entity merger using deterministic grouping rules."""

    def merge(self, entities: list[ExtractedEntity]) -> list[MergedEntity]:
        if not entities:
            return []

        # Key: (type_upper, normalized_val)
        grouped: dict[tuple[str, str], list[ExtractedEntity]] = defaultdict(list)

        for ent in entities:
            if not ent.value or not ent.value.strip():
                continue
            ent_type = (ent.entity_type or "UNKNOWN").upper().strip()
            norm_val = _normalize_value(ent.value)
            grouped[(ent_type, norm_val)].append(ent)

        results: list[MergedEntity] = []
        for (ent_type, norm_val), group in grouped.items():
            # Pick canonical value: shortest raw value that retains original casing or first
            raw_vals_distinct: list[str] = []
            seen_raw: set[str] = set()
            sources_distinct: list[str] = []
            seen_sources: set[str] = set()
            max_conf = 0.0

            for item in group:
                raw = item.value.strip()
                if raw not in seen_raw:
                    seen_raw.add(raw)
                    raw_vals_distinct.append(raw)

                src = (item.source or "unknown").strip()
                if src not in seen_sources:
                    seen_sources.add(src)
                    sources_distinct.append(src)

                if item.confidence > max_conf:
                    max_conf = item.confidence

            # Canonical value: select clearest raw representation (e.g. capitalized)
            canonical = raw_vals_distinct[0]

            results.append(
                MergedEntity(
                    entity_type=ent_type,
                    canonical_value=canonical,
                    raw_values=raw_vals_distinct,
                    sources=sources_distinct,
                    confidence=round(max_conf, 4),
                    occurrence_count=len(group),
                )
            )

        # Sort: occurrence count descending, then canonical_value ascending
        results.sort(key=lambda e: (-e.occurrence_count, e.canonical_value.lower()))
        return results


class MockEntityMerger(IEntityMerger):
    """Mock entity merger for tests."""

    def __init__(self, fixed_results: list[MergedEntity] | None = None) -> None:
        self._fixed_results = fixed_results

    def merge(self, entities: list[ExtractedEntity]) -> list[MergedEntity]:
        if self._fixed_results is not None:
            return self._fixed_results
        # Default fallback logic using deterministic merger
        return DeterministicEntityMerger().merge(entities)
