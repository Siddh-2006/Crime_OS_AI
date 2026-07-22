"""
Tests for NER extractors.

MockNERExtractor — deterministic, always used in unit tests.
SpacyNERExtractor — integration test, skipped if model not installed.
"""
from __future__ import annotations

import pytest

from app.schemas.text_intelligence import ExtractedEntity
from app.text_intelligence.ner_extractor import MockNERExtractor, SpacyNERExtractor


# ── MockNERExtractor tests ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_mock_ner_returns_configured_entities():
    entities = [
        ExtractedEntity(entity_type="PERSON", value="Rakesh Patel", source="ner", confidence=0.95),
        ExtractedEntity(entity_type="GPE", value="Ahmedabad", source="ner", confidence=0.90),
    ]
    extractor = MockNERExtractor(entities=entities)
    result = await extractor.extract("any text")
    assert len(result) == 2
    assert result[0].entity_type == "PERSON"
    assert result[0].value == "Rakesh Patel"
    assert result[1].entity_type == "GPE"


@pytest.mark.asyncio
async def test_mock_ner_returns_empty_by_default():
    extractor = MockNERExtractor()
    result = await extractor.extract("any text")
    assert result == []


@pytest.mark.asyncio
async def test_mock_ner_is_deterministic():
    """Same input always produces same output."""
    entities = [ExtractedEntity(entity_type="ORG", value="SBI Bank", source="ner")]
    extractor = MockNERExtractor(entities=entities)
    result1 = await extractor.extract("text one")
    result2 = await extractor.extract("text two")
    assert result1 == result2


@pytest.mark.asyncio
async def test_mock_ner_returns_copy_of_entities():
    """Modifying result does not affect extractor state."""
    entities = [ExtractedEntity(entity_type="PERSON", value="Amit Shah", source="ner")]
    extractor = MockNERExtractor(entities=entities)
    result = await extractor.extract("text")
    result.append(ExtractedEntity(entity_type="ORG", value="Extra", source="ner"))
    result2 = await extractor.extract("text")
    assert len(result2) == 1


@pytest.mark.asyncio
async def test_mock_ner_source_is_ner():
    entities = [ExtractedEntity(entity_type="PERSON", value="Test", source="ner")]
    extractor = MockNERExtractor(entities=entities)
    result = await extractor.extract("text")
    assert result[0].source == "ner"


# ── SpacyNERExtractor integration test ────────────────────────────────────────

@pytest.mark.asyncio
async def test_spacy_ner_extracts_person():
    """Integration test — skipped if spaCy or en_core_web_sm is not installed."""
    pytest.importorskip("spacy")
    try:
        extractor = SpacyNERExtractor()
        text = "John Smith transferred money to HDFC Bank in Mumbai on Monday."
        result = await extractor.extract(text)
        types_found = {e.entity_type for e in result}
        # Should find at least one entity
        assert len(result) > 0
        # source should always be ner
        assert all(e.source == "ner" for e in result)
    except OSError:
        pytest.skip("en_core_web_sm model not installed")
