"""
Tests for TemporalEventExtractor.
"""
from __future__ import annotations

import pytest

from app.schemas.text_intelligence import ExtractedEntity
from app.text_intelligence.event_extractor import TemporalEventExtractor


@pytest.fixture
def extractor() -> TemporalEventExtractor:
    return TemporalEventExtractor()


def _entity(entity_type: str, value: str, start: int = 0, end: int = 10) -> ExtractedEntity:
    return ExtractedEntity(entity_type=entity_type, value=value, source="ner", start=start, end=end)


@pytest.mark.asyncio
async def test_event_extracted_from_temporal_sentence(extractor):
    text = "Rakesh Patel reported that Rs. 48,000 was debited on 12 July 2026."
    entities = [
        _entity("PERSON", "Rakesh Patel", 0, 12),
        _entity("date", "12 July 2026", 54, 66),
    ]
    events = await extractor.extract(text, entities)
    assert len(events) == 1
    assert events[0].timestamp == "12 July 2026"
    assert events[0].action == "debited"


@pytest.mark.asyncio
async def test_no_events_without_temporal_markers(extractor):
    text = "The complainant stated the suspect wore a blue jacket."
    entities = [
        _entity("PERSON", "complainant", 4, 15),
    ]
    events = await extractor.extract(text, entities)
    assert events == []


@pytest.mark.asyncio
async def test_multiple_events_in_text(extractor):
    s1 = "Money was debited on 12 July 2026."
    s2 = "The suspect was arrested on 14 July 2026."
    text = f"{s1} {s2}"
    # Compute real offsets in the joined text
    idx1 = text.index("12 July 2026")
    idx2 = text.index("14 July 2026")
    entities = [
        _entity("date", "12 July 2026", idx1, idx1 + 12),
        _entity("date", "14 July 2026", idx2, idx2 + 12),
    ]
    events = await extractor.extract(text, entities)
    assert len(events) == 2
    timestamps = {e.timestamp for e in events}
    assert "12 July 2026" in timestamps
    assert "14 July 2026" in timestamps


@pytest.mark.asyncio
async def test_event_actors_populated(extractor):
    text = "Rakesh Patel transferred the funds on 12 July 2026."
    entities = [
        _entity("PERSON", "Rakesh Patel", 0, 12),
        _entity("date", "12 July 2026", 38, 50),
    ]
    events = await extractor.extract(text, entities)
    assert len(events) == 1
    assert "Rakesh Patel" in events[0].actors


@pytest.mark.asyncio
async def test_event_location_populated(extractor):
    text = "The theft occurred in Ahmedabad on 15 January 2026."
    entities = [
        _entity("GPE", "Ahmedabad", 21, 30),
        _entity("date", "15 January 2026", 34, 50),
    ]
    events = await extractor.extract(text, entities)
    assert len(events) == 1
    assert events[0].location == "Ahmedabad"


@pytest.mark.asyncio
async def test_event_id_is_unique(extractor):
    text = "Fraud happened on 12 July 2026. Another fraud on 13 July 2026."
    entities = [
        _entity("date", "12 July 2026", 18, 30),
        _entity("date", "13 July 2026", 50, 62),
    ]
    events = await extractor.extract(text, entities)
    assert len(events) == 2
    ids = [e.event_id for e in events]
    assert ids[0] != ids[1]


@pytest.mark.asyncio
async def test_empty_text_returns_empty_events(extractor):
    events = await extractor.extract("", [])
    assert events == []
