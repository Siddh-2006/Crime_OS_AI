"""
Tests for TextIntelligenceWorker.
"""
from __future__ import annotations

import pytest

from app.schemas.text_intelligence import ExtractedEntity, TextIntelligenceResult
from app.text_intelligence.entity_linker import PassthroughEntityLinker
from app.text_intelligence.event_extractor import TemporalEventExtractor
from app.text_intelligence.ner_extractor import MockNERExtractor
from app.text_intelligence.regex_extractor import IndianRegexExtractor
from app.text_intelligence.worker import TextIntelligenceWorker


@pytest.fixture
def worker() -> TextIntelligenceWorker:
    return TextIntelligenceWorker(
        ner_extractor=MockNERExtractor(),
        regex_extractor=IndianRegexExtractor(),
        event_extractor=TemporalEventExtractor(),
        entity_linker=PassthroughEntityLinker(),
    )


@pytest.mark.asyncio
async def test_worker_returns_text_intelligence_result(worker):
    payload = {
        "text": "Rs. 48,000 was debited on 12 July 2026.",
        "source_type": "complaint",
    }
    result = await worker.run(payload, job_id="test-001")
    assert result.succeeded
    assert result.output is not None
    # Validate shape
    tir = TextIntelligenceResult.model_validate(result.output)
    assert tir.source_type == "complaint"
    assert tir.input_text_length > 0
    assert tir.processing_duration_ms >= 0


@pytest.mark.asyncio
async def test_worker_extracts_regex_entities(worker):
    payload = {
        "text": "Phone +91-9876543210. UPI: victim@ybl. RRN 402198337210.",
        "source_type": "ocr",
    }
    result = await worker.run(payload, job_id="test-002")
    assert result.succeeded
    tir = TextIntelligenceResult.model_validate(result.output)
    types_found = {e.entity_type for e in tir.entities}
    assert "phone" in types_found
    assert "transaction_ref" in types_found


@pytest.mark.asyncio
async def test_worker_merges_ner_and_regex_entities(worker):
    """Worker with mock NER providing PERSON entity + regex for phone."""
    mock_ner = MockNERExtractor(entities=[
        ExtractedEntity(entity_type="PERSON", value="Rakesh Patel", source="ner"),
    ])
    w = TextIntelligenceWorker(
        ner_extractor=mock_ner,
        regex_extractor=IndianRegexExtractor(),
        event_extractor=TemporalEventExtractor(),
        entity_linker=PassthroughEntityLinker(),
    )
    payload = {"text": "Rakesh Patel called +91-9876543210.", "source_type": "complaint"}
    result = await w.run(payload, job_id="test-003")
    assert result.succeeded
    tir = TextIntelligenceResult.model_validate(result.output)
    types_found = {e.entity_type for e in tir.entities}
    assert "PERSON" in types_found
    assert "phone" in types_found


@pytest.mark.asyncio
async def test_worker_deduplicates_entities(worker):
    """Duplicate entities (same type + value) should appear only once."""
    mock_ner = MockNERExtractor(entities=[
        ExtractedEntity(entity_type="PERSON", value="Rakesh", source="ner", confidence=0.9),
        ExtractedEntity(entity_type="PERSON", value="Rakesh", source="ner", confidence=0.8),
    ])
    w = TextIntelligenceWorker(
        ner_extractor=mock_ner,
        regex_extractor=IndianRegexExtractor(),
        event_extractor=TemporalEventExtractor(),
        entity_linker=PassthroughEntityLinker(),
    )
    payload = {"text": "Rakesh was the suspect.", "source_type": "complaint"}
    result = await w.run(payload, job_id="test-004")
    assert result.succeeded
    tir = TextIntelligenceResult.model_validate(result.output)
    person_entities = [e for e in tir.entities if e.entity_type == "PERSON" and e.value == "Rakesh"]
    assert len(person_entities) == 1
    assert person_entities[0].confidence == 0.9  # higher confidence wins


@pytest.mark.asyncio
async def test_worker_fails_on_missing_text(worker):
    result = await worker.run({"source_type": "complaint"}, job_id="test-005")
    assert not result.succeeded
    assert "text" in result.error.lower()


@pytest.mark.asyncio
async def test_worker_source_type_propagated(worker):
    for source_type in ("complaint", "ocr", "audio", "pdf"):
        payload = {"text": "The incident occurred on 12 July 2026.", "source_type": source_type}
        result = await worker.run(payload, job_id=f"test-st-{source_type}")
        assert result.succeeded
        tir = TextIntelligenceResult.model_validate(result.output)
        assert tir.source_type == source_type


@pytest.mark.asyncio
async def test_worker_events_extracted_from_temporal_text():
    """Full integration: NER provides PERSON, regex provides date, event is built."""
    mock_ner = MockNERExtractor(entities=[
        ExtractedEntity(entity_type="PERSON", value="Priya Sharma", source="ner", start=0, end=12),
    ])
    w = TextIntelligenceWorker(
        ner_extractor=mock_ner,
        regex_extractor=IndianRegexExtractor(),
        event_extractor=TemporalEventExtractor(),
        entity_linker=PassthroughEntityLinker(),
    )
    payload = {
        "text": "Priya Sharma reported Rs. 25,000 was debited on 15 July 2026.",
        "source_type": "complaint",
    }
    result = await w.run(payload, job_id="test-events-001")
    assert result.succeeded
    tir = TextIntelligenceResult.model_validate(result.output)
    assert len(tir.events) >= 1
    assert any(e.timestamp is not None for e in tir.events)
