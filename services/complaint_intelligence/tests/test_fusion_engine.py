"""
Unit tests for Intelligence Fusion Engine (M9).
"""
from __future__ import annotations

import pytest

from app.fusion.entity_merger import DeterministicEntityMerger
from app.fusion.event_merger import DeterministicEventMerger
from app.fusion.fusion_engine import IntelligenceFusionEngine
from app.schemas.complaint import ComplaintProfile
from app.schemas.fusion import EvidenceRef, FusionInput, InvestigationContext
from app.schemas.text_intelligence import ExtractedEntity, ExtractedEvent


@pytest.fixture
def sample_complaint() -> ComplaintProfile:
    return ComplaintProfile(
        crime_type="cyber_financial_fraud",
        priority="high",
        summary="Victim defrauded of INR 50,000 via phishing link on WhatsApp.",
        missing_information=["bank_account_number"],
        recommendations=["Freeze suspect bank account", "Request IP logs from WhatsApp"],
        confidence=0.95,
    )


@pytest.mark.unit
def test_entity_merger_deduplicates_and_aggregates():
    merger = DeterministicEntityMerger()
    entities = [
        ExtractedEntity(entity_type="PERSON", value="Ramesh Kumar", source="complaint", confidence=0.9),
        ExtractedEntity(entity_type="person", value="ramesh kumar", source="audio_transcript", confidence=0.95),
        ExtractedEntity(entity_type="PHONE", value="+91-9876543210", source="ocr_image_1", confidence=0.99),
        ExtractedEntity(entity_type="phone", value="+91 9876543210", source="pdf_doc", confidence=0.98),
    ]

    merged = merger.merge(entities)
    assert len(merged) == 2

    person_ent = next(e for e in merged if e.entity_type == "PERSON")
    assert person_ent.occurrence_count == 2
    assert person_ent.confidence == 0.95
    assert set(person_ent.sources) == {"complaint", "audio_transcript"}

    phone_ent = next(e for e in merged if e.entity_type == "PHONE")
    assert phone_ent.occurrence_count == 2
    assert phone_ent.confidence == 0.99
    assert set(phone_ent.sources) == {"ocr_image_1", "pdf_doc"}


@pytest.mark.unit
def test_event_merger_deduplicates_matching_events():
    merger = DeterministicEventMerger()
    events = [
        ExtractedEvent(
            event_id="e1",
            description="Money transferred to scammer account",
            actors=["Ramesh Kumar", "Scammer"],
            action="transfer",
            timestamp="2026-07-20 10:00 AM",
            source_text="Transferred 50000 at 10 AM",
        ),
        ExtractedEvent(
            event_id="e2",
            description="Money transferred to scammer account",
            actors=["Ramesh Kumar"],
            action="transfer",
            timestamp="2026-07-20 10:00 AM",
            source_text="Transaction completed",
        ),
    ]

    merged = merger.merge(events)
    assert len(merged) == 1
    m_evt = merged[0]
    assert m_evt.action == "transfer"
    assert "Ramesh Kumar" in m_evt.actors
    assert "Scammer" in m_evt.actors


@pytest.mark.unit
def test_fusion_engine_builds_complete_investigation_context(sample_complaint):
    engine = IntelligenceFusionEngine(
        entity_merger=DeterministicEntityMerger(),
        event_merger=DeterministicEventMerger(),
    )

    fusion_input = FusionInput(
        complaint_profile=sample_complaint,
        entities=[
            ExtractedEntity(entity_type="PERSON", value="Ramesh Kumar", source="complaint"),
            ExtractedEntity(entity_type="BANK_ACCOUNT", value="987654321098", source="pdf_statement"),
        ],
        events=[
            ExtractedEvent(
                event_id="ev1",
                description="Clicked phishing link",
                actors=["Ramesh Kumar"],
                action="clicked",
                timestamp="2026-07-19",
            )
        ],
        evidence_references=[
            EvidenceRef(evidence_id="ev_001", evidence_type="pdf", file_name="statement.pdf")
        ],
    )

    context = engine.fuse(fusion_input)

    assert isinstance(context, InvestigationContext)
    assert context.context_id.startswith("ctx_")
    assert context.complaint_profile.crime_type == "cyber_financial_fraud"
    assert context.total_entities_fused == 2
    assert context.total_events_fused == 1
    assert len(context.evidence_sources) == 1
    assert context.evidence_sources[0].file_name == "statement.pdf"


@pytest.mark.unit
def test_fusion_engine_handles_empty_input(sample_complaint):
    engine = IntelligenceFusionEngine(
        entity_merger=DeterministicEntityMerger(),
        event_merger=DeterministicEventMerger(),
    )

    fusion_input = FusionInput(
        complaint_profile=sample_complaint,
        entities=[],
        events=[],
        evidence_references=[],
    )

    context = engine.fuse(fusion_input)
    assert len(context.entities) == 0
    assert len(context.events) == 0
    assert context.total_entities_fused == 0
    assert context.total_events_fused == 0
