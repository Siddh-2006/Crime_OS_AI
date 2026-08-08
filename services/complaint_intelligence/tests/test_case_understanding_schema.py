"""
Unit tests for CaseUnderstanding 5-section JSON schema validation.
"""
import pytest
from app.schemas.case_understanding import (
    CaseUnderstanding,
    CaseUnderstandingOverview,
    ContradictionItem,
    EvidenceIntelligenceItem,
    MissingInformationAndEvidenceItem,
    TimelineEvent,
)


def test_full_case_understanding_5section_schema_validation():
    sample_data = {
        "case_id": "test-case-001",
        "case_understanding": {
            "executive_summary": "Victim cheated of RS 50000 by investment scam.",
            "incident_brief": "Victim joined WhatsApp group and paid to fake bank accounts.",
            "crime_category": "Cyber Fraud",
            "crime_subtype": "Investment Scam",
            "priority": "high",
            "confidence": 0.95,
        },
        "timeline": [
            {
                "timestamp": "18-07-2026 19:46:00",
                "description": "Payment of 25000 transferred via UPI",
                "supporting_evidence_ids": ["ev-1"],
                "confidence": 0.9,
            }
        ],
        "evidence_intelligence": [
            {
                "evidence_id": "ev-1",
                "filename": "screenshot.png",
                "caption": "Google Pay payment successful receipt",
                "summary": "Payment of 25000 to rajesh@ybl",
                "importance": "high",
                "supports": ["Money transferred to scammer"],
                "confidence": 0.95,
            }
        ],
        "missing_information_and_evidence": [
            {
                "title": "Bank Transaction UTR Number",
                "description": "Required for bank freeze request",
                "importance": "high",
            }
        ],
        "contradictions": [
            {
                "description": "Timestamp mismatch between bank SMS and screenshot",
                "related_evidence_ids": ["ev-1"],
                "confidence": 0.8,
            }
        ],
        "original_complaint": "I was cheated of RS 50000 by investment scam.",
    }

    model = CaseUnderstanding.model_validate(sample_data)
    assert model.case_id == "test-case-001"
    assert model.case_understanding.executive_summary == "Victim cheated of RS 50000 by investment scam."
    assert model.case_understanding.complaint_summary == "Victim cheated of RS 50000 by investment scam."
    assert model.case_understanding.incident_brief == "Victim joined WhatsApp group and paid to fake bank accounts."
    assert model.case_understanding.incident_overview == "Victim joined WhatsApp group and paid to fake bank accounts."
    assert model.case_understanding.crime_category == "Cyber Fraud"
    assert model.overview.crime_category == "Cyber Fraud"
    assert len(model.evidence_intelligence) == 1
    assert model.evidence_intelligence[0].caption == "Google Pay payment successful receipt"
    assert len(model.missing_information_and_evidence) == 1
    assert model.missing_information_and_evidence[0].title == "Bank Transaction UTR Number"
    assert len(model.contradictions) == 1
    assert model.contradictions[0].related_evidence_ids == ["ev-1"]


def test_legacy_schema_alias_compatibility():
    legacy_data = {
        "case_id": "legacy-case-002",
        "overview": {
            "complaint_summary": "Legacy complaint summary",
            "incident_overview": "Legacy incident overview",
            "crime_category": "Financial Fraud",
            "crime_subtype": "Phishing",
            "priority": "medium",
            "confidence": 0.9,
        },
        "evidence_analysis": [
            {
                "evidence_id": "ev-legacy",
                "filename": "chat.png",
                "summary": "WhatsApp chat screenshot",
                "extracted_information": "Chat screenshot details",
                "importance": "medium",
                "allegations_supported": ["Scammer made false promises"],
                "confidence": 0.85,
            }
        ],
        "missing_information": [
            {
                "item": "Beneficiary Name",
                "reason": "Clarify beneficiary identity",
                "importance": "medium",
            }
        ],
    }

    model = CaseUnderstanding.model_validate(legacy_data)
    assert model.case_id == "legacy-case-002"
    assert model.case_understanding.crime_category == "Financial Fraud"
    assert len(model.evidence_intelligence) == 1
    assert model.evidence_intelligence[0].supports == ["Scammer made false promises"]
    assert len(model.missing_information_and_evidence) == 1
    assert model.missing_information_and_evidence[0].title == "Beneficiary Name"
