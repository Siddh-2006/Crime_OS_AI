"""
Unit tests for CaseUnderstanding 9-section JSON schema validation.
"""
import pytest
from app.schemas.case_understanding import (
    CaseUnderstanding,
    ContradictionItem,
    CrimeAnalysis,
    EntityItem,
    EvidenceAnalysisItem,
    EvidenceCorrelationItem,
    MissingEvidenceItem,
    MissingInfoItem,
    Overview,
    PeopleAndEntities,
    TimelineEvent,
)


def test_full_case_understanding_schema_validation():
    sample_data = {
        "case_id": "test-case-001",
        "overview": {
            "complaint_summary": "Victim cheated of RS 50000 by investment scam.",
            "incident_overview": "Victim joined WhatsApp group and paid to fake bank accounts.",
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
        "people_and_entities": {
            "victims": [{"value": "Rahul Sharma", "source_evidence_ids": ["ev-1"], "confidence": 0.95}],
            "suspects": [{"value": "Rajesh Kumar", "source_evidence_ids": ["ev-1"], "confidence": 0.9}],
            "witnesses": [],
            "other_persons": [],
            "organizations": [{"value": "Viking Global INVST", "source_evidence_ids": ["ev-1"], "confidence": 0.9}],
            "locations": [{"value": "Surat", "source_evidence_ids": [], "confidence": 0.8}],
            "vehicles": [],
            "phone_numbers": [{"value": "+918269935967", "source_evidence_ids": ["ev-1"], "confidence": 0.95}],
            "emails": [{"value": "rahulsharma123@sbi", "source_evidence_ids": ["ev-1"], "confidence": 0.95}],
            "upi_ids": [{"value": "rajesh@ybl", "source_evidence_ids": ["ev-1"], "confidence": 0.95}],
            "bank_accounts": [{"value": "Indusind Bank 257505485730", "source_evidence_ids": ["ev-1"], "confidence": 0.95}],
            "documents": [],
            "money": [{"value": "₹25,000", "source_evidence_ids": ["ev-1"], "confidence": 0.95}],
            "digital_assets": [],
            "physical_assets": [],
        },
        "evidence_analysis": [
            {
                "evidence_id": "ev-1",
                "filename": "screenshot.png",
                "summary": "Google Pay payment successful receipt",
                "extracted_information": "Payment of 25000 to rajesh@ybl",
                "importance": "high",
                "allegations_supported": ["Money transferred to scammer"],
                "confidence": 0.95,
            }
        ],
        "evidence_correlation": [
            {
                "allegation": "Money transferred to scammer",
                "supporting_evidence_ids": ["ev-1"],
                "confidence": 0.98,
                "contradicts_claim": False,
                "explanation": "UPI screenshot corroborates transfer of 25,000.",
            }
        ],
        "crime_analysis": {
            "crime_category": "Cyber Fraud",
            "crime_subtype": "Investment Scam",
            "modus_operandi": "Victim enticed into fake investment WhatsApp group.",
            "estimated_financial_loss": 50000.0,
            "digital_assets_involved": ["UPI rajesh@ybl"],
            "physical_assets_involved": [],
        },
        "contradictions": [
            {
                "description": "Timestamp mismatch between bank SMS and screenshot",
                "involved_evidence_ids": ["ev-1"],
                "confidence": 0.8,
            }
        ],
        "missing_information": [
            {
                "item": "Bank Transaction UTR Number",
                "reason": "Required for bank freeze request",
                "importance": "high",
            }
        ],
        "missing_evidence": [
            {
                "evidence_name": "Bank Statement",
                "reason_relevant": "To confirm debit entry",
                "related_allegation": "Money deducted from victim account",
                "importance": "high",
            }
        ],
        "original_complaint": "I was cheated of RS 50000 by investment scam.",
    }

    model = CaseUnderstanding.model_validate(sample_data)
    assert model.case_id == "test-case-001"
    assert model.overview.crime_category == "Cyber Fraud"
    assert len(model.people_and_entities.victims) == 1
    assert model.people_and_entities.victims[0].value == "Rahul Sharma"
    assert len(model.evidence_correlation) == 1
    assert model.evidence_correlation[0].contradicts_claim is False
    assert len(model.missing_evidence) == 1
    assert model.missing_evidence[0].evidence_name == "Bank Statement"
