"""
Unit tests for Milestone 11 — Timeline Intelligence Engine.

Tests cover:
  - Successful LLM response parsing → full TimelineIntelligence
  - LLM failure → passthrough fallback
  - Invalid JSON response → passthrough fallback
  - UNPARSED timestamps always highlighted (even if LLM misses them)
  - TimelineFallbackEngine (pure-Python path)
  - Passthrough entries reflect original description unchanged
"""
from __future__ import annotations

import json
import uuid

import pytest

from app.llm.client import MockLLMClient
from app.schemas.complaint import ComplaintProfile
from app.schemas.fusion import EvidenceRef
from app.schemas.timeline import ParsedDateTime, Timeline, TimelineEntry, TimestampPrecision
from app.schemas.timeline_intelligence import TimelineIntelligenceInput
from app.timeline_intelligence.engine import TimelineFallbackEngine, TimelineIntelligenceEngine


# ────────────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────────────

def _make_complaint() -> ComplaintProfile:
    return ComplaintProfile(
        crime_type="cyber_fraud",
        priority="high",
        summary="Victim transferred money after being defrauded.",
        missing_information=[],
        recommendations=[],
        confidence=0.9,
    )


def _make_parsed_time(iso: str | None = "2026-07-20T10:00:00Z") -> ParsedDateTime:
    if iso is None:
        return ParsedDateTime(precision=TimestampPrecision.UNPARSED, raw_text="unknown time")
    return ParsedDateTime(
        iso_timestamp_utc=iso,
        year=2026,
        month=7,
        day=20,
        hour=10,
        minute=0,
        second=0,
        precision=TimestampPrecision.SECOND,
        raw_text="20 July 2026 10:00",
    )


def _make_entry(event_id: str = "ev1", unparsed: bool = False) -> TimelineEntry:
    return TimelineEntry(
        entry_id=str(uuid.uuid4()),
        event_id=event_id,
        description="Victim transferred Rs 50,000 to fraudster.",
        actors=["Victim", "Fraudster"],
        action="transfer",
        raw_timestamp=None if unparsed else "20 July 2026",
        parsed_time=_make_parsed_time(None if unparsed else "2026-07-20T10:00:00Z"),
        location="Mumbai",
        sources=["complaint"],
        confidence=1.0,
    )


def _make_timeline(entries: list[TimelineEntry] | None = None) -> Timeline:
    if entries is None:
        entries = [_make_entry("ev1")]
    unparsed = sum(1 for e in entries if e.parsed_time.precision == TimestampPrecision.UNPARSED)
    return Timeline(
        timeline_id=str(uuid.uuid4()),
        context_id="ctx1",
        entries=entries,
        start_time="2026-07-20T10:00:00Z",
        end_time="2026-07-20T10:00:00Z",
        total_events=len(entries),
        unparsed_count=unparsed,
    )


def _make_payload(entries: list[TimelineEntry] | None = None) -> TimelineIntelligenceInput:
    return TimelineIntelligenceInput(
        complaint_profile=_make_complaint(),
        timeline=_make_timeline(entries),
        evidence_references=[],
    )


def _make_llm_response(timeline: Timeline, *, refined_desc: str = "The victim transferred Rs 50,000.") -> str:
    entry = timeline.entries[0]
    data = {
        "summary": "On 20 July 2026, the victim transferred Rs 50,000 to the fraudster.",
        "refined_entries": [
            {
                "entry_id": entry.entry_id,
                "event_id": entry.event_id,
                "original_description": entry.description,
                "refined_description": refined_desc,
                "resolved_actors": list(entry.actors),
                "action": entry.action,
                "parsed_time": entry.parsed_time.model_dump(mode="json"),
                "location": entry.location,
                "sources": list(entry.sources),
            }
        ],
        "contradictions": [
            {
                "contradiction_id": "C-1",
                "contradiction_type": "fact_conflict",
                "description": "No contradiction found.",
                "conflicting_event_ids": [],
                "severity": "low",
            }
        ],
        "causal_relationships": [
            {
                "link_id": "L-1",
                "cause_event_id": entry.event_id,
                "effect_event_id": entry.event_id,
                "reasoning": "Transfer preceded complaint by one day.",
            }
        ],
        "missing_timestamp_highlights": [],
    }
    return json.dumps(data)


# ────────────────────────────────────────────────────────────────────────────
# Tests — TimelineIntelligenceEngine
# ────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_engine_parses_successful_llm_response():
    """Full success path: LLM returns valid JSON → TimelineIntelligence populated."""
    timeline = _make_timeline()
    payload = _make_payload()

    llm = MockLLMClient(default_response=_make_llm_response(timeline))
    engine = TimelineIntelligenceEngine(llm_client=llm)

    result = await engine.analyze(payload)

    assert result.intelligence_id
    assert result.timeline_id == payload.timeline.timeline_id
    assert "victim" in result.summary.lower()
    assert len(result.refined_entries) == 1
    assert result.refined_entries[0].refined_description == "The victim transferred Rs 50,000."
    assert len(result.contradictions) == 1
    assert len(result.causal_relationships) == 1
    assert result.processing_duration_ms >= 0


@pytest.mark.asyncio
async def test_engine_falls_back_on_llm_error():
    """LLM raises LLMError → passthrough intelligence returned, no exception raised."""
    from app.core.exceptions import LLMError

    class FailingLLMClient(MockLLMClient):
        async def generate(self, prompt: str, system_prompt=None) -> str:
            raise LLMError("Ollama unavailable")

    payload = _make_payload()
    engine = TimelineIntelligenceEngine(llm_client=FailingLLMClient())
    result = await engine.analyze(payload)

    # Should not raise — should passthrough
    assert result.intelligence_id
    assert len(result.refined_entries) == 1
    # Passthrough: refined_description == original description
    assert result.refined_entries[0].refined_description == result.refined_entries[0].original_description
    assert result.contradictions == []
    assert result.causal_relationships == []


@pytest.mark.asyncio
async def test_engine_falls_back_on_invalid_json():
    """LLM returns non-JSON text → passthrough intelligence returned."""
    llm = MockLLMClient(default_response="Sorry, I cannot answer this question.")
    engine = TimelineIntelligenceEngine(llm_client=llm)
    payload = _make_payload()

    result = await engine.analyze(payload)

    assert result.intelligence_id
    assert result.contradictions == []
    assert len(result.refined_entries) == 1
    # Passthrough: descriptions are identical
    assert result.refined_entries[0].refined_description == result.refined_entries[0].original_description


@pytest.mark.asyncio
async def test_engine_always_highlights_unparsed_timestamps():
    """UNPARSED entries from M10 are always highlighted, even if LLM skips them."""
    entries = [
        _make_entry("ev_parsed", unparsed=False),
        _make_entry("ev_unparsed", unparsed=True),
    ]
    timeline = _make_timeline(entries)
    payload = _make_payload(entries)

    # LLM returns no missing_timestamp_highlights (skips the unparsed entry)
    data = {
        "summary": "Test summary.",
        "refined_entries": [],
        "contradictions": [],
        "causal_relationships": [],
        "missing_timestamp_highlights": [],
    }
    llm = MockLLMClient(default_response=json.dumps(data))
    engine = TimelineIntelligenceEngine(llm_client=llm)

    result = await engine.analyze(payload)

    unparsed_event_ids = {h.event_id for h in result.missing_timestamp_highlights}
    assert "ev_unparsed" in unparsed_event_ids, (
        "Engine must always flag UNPARSED entries regardless of LLM output"
    )
    assert "ev_parsed" not in unparsed_event_ids


@pytest.mark.asyncio
async def test_engine_does_not_duplicate_llm_flagged_highlights():
    """If LLM already flags an UNPARSED event, don't add it again."""
    entries = [_make_entry("ev_unparsed", unparsed=True)]
    timeline = _make_timeline(entries)
    payload = _make_payload(entries)

    entry = entries[0]
    data = {
        "summary": "Missing timestamp event.",
        "refined_entries": [
            {
                "entry_id": entry.entry_id,
                "event_id": entry.event_id,
                "original_description": entry.description,
                "refined_description": entry.description,
                "resolved_actors": [],
                "action": "",
                "parsed_time": entry.parsed_time.model_dump(mode="json"),
                "location": None,
                "sources": [],
            }
        ],
        "contradictions": [],
        "causal_relationships": [],
        "missing_timestamp_highlights": [
            {
                "event_id": "ev_unparsed",
                "description": entry.description,
                "impact": "Timestamp unavailable.",
                "suggested_window": None,
            }
        ],
    }
    llm = MockLLMClient(default_response=json.dumps(data))
    engine = TimelineIntelligenceEngine(llm_client=llm)
    result = await engine.analyze(payload)

    # Must appear exactly once
    ev_ids = [h.event_id for h in result.missing_timestamp_highlights]
    assert ev_ids.count("ev_unparsed") == 1


@pytest.mark.asyncio
async def test_engine_handles_empty_timeline():
    """Timeline with zero entries produces empty analysis without error."""
    payload = _make_payload(entries=[])
    llm = MockLLMClient(default_response=json.dumps({
        "summary": "No events recorded.",
        "refined_entries": [],
        "contradictions": [],
        "causal_relationships": [],
        "missing_timestamp_highlights": [],
    }))
    engine = TimelineIntelligenceEngine(llm_client=llm)
    result = await engine.analyze(payload)

    assert result.refined_entries == []
    assert result.missing_timestamp_highlights == []
    assert "No events" in result.summary


@pytest.mark.asyncio
async def test_engine_tolerates_malformed_refined_entries():
    """Malformed entry in LLM JSON is skipped; valid entries pass through."""
    entry = _make_entry("ev1")
    timeline = _make_timeline([entry])
    payload = _make_payload([entry])

    good_entry = {
        "entry_id": entry.entry_id,
        "event_id": entry.event_id,
        "original_description": entry.description,
        "refined_description": "Good refined description.",
        "resolved_actors": [],
        "action": "transfer",
        "parsed_time": entry.parsed_time.model_dump(mode="json"),
        "location": None,
        "sources": [],
    }
    data = {
        "summary": "One good, one bad.",
        "refined_entries": [
            {"totally": "broken"},        # malformed → skipped
            good_entry,                    # valid → kept
        ],
        "contradictions": [],
        "causal_relationships": [],
        "missing_timestamp_highlights": [],
    }
    llm = MockLLMClient(default_response=json.dumps(data))
    engine = TimelineIntelligenceEngine(llm_client=llm)
    result = await engine.analyze(payload)

    assert len(result.refined_entries) == 1
    assert result.refined_entries[0].refined_description == "Good refined description."


# ────────────────────────────────────────────────────────────────────────────
# Tests — TimelineFallbackEngine
# ────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_fallback_engine_passthrough():
    """Fallback engine returns passthrough with no contradictions or causal links."""
    entries = [_make_entry("ev1"), _make_entry("ev2")]
    payload = _make_payload(entries)

    engine = TimelineFallbackEngine()
    result = await engine.analyze(payload)

    assert len(result.refined_entries) == 2
    assert result.contradictions == []
    assert result.causal_relationships == []
    # Descriptions pass through unchanged
    for re_, te in zip(result.refined_entries, entries):
        assert re_.refined_description == te.description


@pytest.mark.asyncio
async def test_fallback_engine_highlights_unparsed():
    """Fallback engine highlights UNPARSED entries from M10."""
    entries = [_make_entry("ev_ok"), _make_entry("ev_bad", unparsed=True)]
    payload = _make_payload(entries)

    engine = TimelineFallbackEngine()
    result = await engine.analyze(payload)

    highlighted = {h.event_id for h in result.missing_timestamp_highlights}
    assert "ev_bad" in highlighted
    assert "ev_ok" not in highlighted


@pytest.mark.asyncio
async def test_fallback_engine_summary_includes_complaint_metadata():
    """Fallback summary references complaint and total event count."""
    payload = _make_payload()
    engine = TimelineFallbackEngine()
    result = await engine.analyze(payload)

    assert "1" in result.summary or "ctx1" in result.summary or "cyber_fraud" in result.summary.lower()
