"""
Unit tests for DeterministicTimelineEngine (M10).
"""
from __future__ import annotations

import pytest

from app.schemas.complaint import ComplaintProfile
from app.schemas.fusion import InvestigationContext, MergedEvent
from app.timeline.deduplicator import DeterministicTimelineDeduplicator
from app.timeline.engine import DeterministicTimelineEngine
from app.timeline.normalizer import DeterministicTimestampNormalizer


@pytest.fixture
def sample_context() -> InvestigationContext:
    complaint = ComplaintProfile(
        crime_type="cyber_financial_fraud",
        priority="high",
        summary="Financial fraud via phishing link.",
        missing_information=[],
        recommendations=[],
        confidence=0.9,
    )

    events = [
        MergedEvent(
            event_id="e3",
            description="Filed formal police complaint",
            actors=["Victim"],
            action="filed_complaint",
            timestamp="2026-07-21 09:00 AM",
            sources=["complaint"],
        ),
        MergedEvent(
            event_id="e1",
            description="Received suspicious WhatsApp message containing link",
            actors=["Victim", "Scammer"],
            action="received_msg",
            timestamp="2026-07-19T14:00:00Z",
            sources=["audio_transcript"],
        ),
        MergedEvent(
            event_id="e2",
            description="Bank account debited INR 50,000",
            actors=["Victim"],
            action="debit",
            timestamp="20/07/2026 10:30 AM",
            sources=["pdf_statement"],
        ),
        MergedEvent(
            event_id="e4",
            description="Unknown background event with unparsed time",
            actors=["Unknown"],
            action="unknown",
            timestamp="sometime earlier",
            sources=["chat"],
        ),
    ]

    return InvestigationContext(
        context_id="ctx_test_001",
        complaint_profile=complaint,
        entities=[],
        events=events,
        evidence_sources=[],
        total_entities_fused=0,
        total_events_fused=len(events),
    )


@pytest.mark.unit
def test_timeline_engine_builds_chronological_sequence(sample_context):
    engine = DeterministicTimelineEngine(
        normalizer=DeterministicTimestampNormalizer(),
        deduplicator=DeterministicTimelineDeduplicator(),
    )

    timeline = engine.build(sample_context)

    assert timeline.context_id == "ctx_test_001"
    assert timeline.total_events == 4
    assert timeline.unparsed_count == 1

    # Verified order:
    # 1. 2026-07-19 (e1)
    # 2. 2026-07-20 (e2)
    # 3. 2026-07-21 (e3)
    # 4. Unparsed (e4)
    assert timeline.entries[0].event_id == "e1"
    assert timeline.entries[1].event_id == "e2"
    assert timeline.entries[2].event_id == "e3"
    assert timeline.entries[3].event_id == "e4"

    assert timeline.start_time == "2026-07-19T14:00:00Z"
    assert timeline.end_time == "2026-07-21T09:00:00Z"


@pytest.mark.unit
def test_timeline_engine_deduplication():
    engine = DeterministicTimelineEngine(
        normalizer=DeterministicTimestampNormalizer(),
        deduplicator=DeterministicTimelineDeduplicator(),
    )

    duplicate_events = [
        MergedEvent(
            event_id="d1",
            description="Money debited",
            actors=["User A"],
            action="debit",
            timestamp="2026-07-20T10:00:00Z",
            sources=["src1"],
        ),
        MergedEvent(
            event_id="d2",
            description="Money debited",
            actors=["User B"],
            action="debit",
            timestamp="2026-07-20T10:00:00Z",
            sources=["src2"],
        ),
    ]

    ctx = InvestigationContext(
        context_id="ctx_dedup",
        complaint_profile=ComplaintProfile(
            crime_type="fraud", priority="low", summary="t", missing_information=[], recommendations=[], confidence=0.5
        ),
        entities=[],
        events=duplicate_events,
        evidence_sources=[],
    )

    timeline = engine.build(ctx)
    assert timeline.total_events == 1
    entry = timeline.entries[0]
    assert set(entry.actors) == {"User A", "User B"}
    assert set(entry.sources) == {"src1", "src2"}
