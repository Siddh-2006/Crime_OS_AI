"""
Unit tests for Milestone 12 — Investigation Intelligence Engine (refined).

Tests the Intelligent Complaint Representation & Understanding Engine.
No action plan, no executive summary, no recommended_source assertions.
"""
import json
import pytest
from unittest.mock import AsyncMock

from app.llm.client import ILLMClient
from app.investigation_intelligence.engine import (
    InvestigationFallbackEngine,
    InvestigationIntelligenceEngine,
)
from app.schemas.complaint import ComplaintProfile
from app.schemas.evidence import EvidenceProfile
from app.schemas.investigation_intelligence import (
    InvestigationIntelligenceInput,
)
from app.schemas.timeline_intelligence import (
    MissingTimestampHighlight,
    TimelineContradiction,
    TimelineIntelligence,
)


def _make_payload() -> InvestigationIntelligenceInput:
    complaint = ComplaintProfile(
        crime_type="cyber_fraud",
        priority="high",
        summary="Victim transferred money after being defrauded.",
        missing_information=["Bank transaction statement"],
        recommendations=["Freeze suspect account"],
        confidence=0.85,
    )

    ev_profile = EvidenceProfile(
        evidence_id="ev_001",
        evidence_type="image",
        file_name="bank_screenshot.jpg",
        status="complete",
    )

    ti = TimelineIntelligence(
        intelligence_id="ti_001",
        timeline_id="tl_001",
        context_id="ctx_001",
        summary="Timeline intelligence summary.",
        refined_entries=[],
        contradictions=[
            TimelineContradiction(
                contradiction_id="c1",
                contradiction_type="timestamp_mismatch",
                description="Transaction timestamp differs by 2 hours.",
                severity="medium",
                conflicting_entries=["ev1", "ev2"],
            )
        ],
        causal_relationships=[],
        missing_timestamp_highlights=[
            MissingTimestampHighlight(
                event_id="ev_unparsed",
                description="Event without explicit timestamp",
                impact="High impact on chronological understanding",
            )
        ],
        confidence_score=0.8,
    )

    return InvestigationIntelligenceInput(
        complaint_profile=complaint,
        evidence_profiles=[ev_profile],
        timeline_intelligence=ti,
    )


def _make_mock_llm_response() -> str:
    return json.dumps({
        "crime_classification": {
            "primary_category": "cyber_fraud",
            "sub_category": "phishing_and_transfer",
            "applicable_statutes": ["IT Act 66D", "IPC 420"],
            "rationale": "Victim defrauded into online transfer per complaint and screenshot evidence.",
        },
        "complaint_understanding": "The victim was defrauded via an online scheme and transferred money to the suspect account. Corroborated by bank transaction screenshot.",
        "correlated_entities": [
            {
                "entity_type": "account",
                "name_or_value": "123456789",
                "role": "instrument",
                "corroborating_sources": ["ev_001"],
            }
        ],
        "contradictions": [
            {
                "contradiction_id": "c1",
                "contradiction_type": "timestamp_mismatch",
                "description": "Transaction timestamp differs by 2 hours.",
                "severity": "medium",
                "conflicting_entries": ["ev1", "ev2"],
            }
        ],
        "investigative_gaps": [
            {
                "gap_id": "g1",
                "description": "Bank transaction statement not present in evidence.",
                "impact": "Cannot confirm transfer amount and destination.",
                "confidence": 0.95,
            }
        ],
        "risk_assessment": {
            "score": 7.5,
            "level": "HIGH",
            "factors": [
                {
                    "factor_name": "Ongoing Financial Risk",
                    "severity": "high",
                    "description": "Suspect account remains active.",
                }
            ],
        },
        "confidence_score": 0.88,
        "confidence_rationale": "High corroboration between complaint and bank screenshot evidence.",
    })


@pytest.mark.asyncio
async def test_engine_parses_successful_llm_response():
    """Engine parses JSON into InvestigationIntelligence — no action_plan, no executive_summary."""
    mock_llm = AsyncMock(spec=ILLMClient)
    mock_llm.generate.return_value = f"```json\n{_make_mock_llm_response()}\n```"

    engine = InvestigationIntelligenceEngine(llm_client=mock_llm)
    result = await engine.analyze(_make_payload())

    assert result.crime_classification.primary_category == "cyber_fraud"
    assert "IT Act 66D" in result.crime_classification.applicable_statutes
    assert "defrauded" in result.complaint_understanding.lower()
    assert len(result.correlated_entities) == 1
    assert result.correlated_entities[0].role == "instrument"
    assert result.risk_assessment.score == 7.5
    assert result.risk_assessment.level == "HIGH"
    assert result.confidence_score == 0.88
    # Must NOT have action_plan or executive_summary
    assert not hasattr(result, "action_plan") or not hasattr(result, "executive_summary")


@pytest.mark.asyncio
async def test_engine_falls_back_on_llm_error():
    """Engine falls back deterministically when LLM raises an error."""
    mock_llm = AsyncMock(spec=ILLMClient)
    mock_llm.generate.side_effect = RuntimeError("Ollama service timeout")

    engine = InvestigationIntelligenceEngine(llm_client=mock_llm)
    result = await engine.analyze(_make_payload())

    assert result.intelligence_id is not None
    assert result.crime_classification.primary_category == "cyber_fraud"
    assert len(result.investigative_gaps) >= 1
    assert result.risk_assessment.level == "HIGH"


@pytest.mark.asyncio
async def test_engine_falls_back_on_invalid_json():
    """Engine falls back deterministically when LLM returns non-JSON."""
    mock_llm = AsyncMock(spec=ILLMClient)
    mock_llm.generate.return_value = "Sorry, I cannot complete this task."

    engine = InvestigationIntelligenceEngine(llm_client=mock_llm)
    result = await engine.analyze(_make_payload())

    assert result.intelligence_id is not None
    assert result.crime_classification.primary_category == "cyber_fraud"
    assert "cyber_fraud" in result.complaint_understanding


@pytest.mark.asyncio
async def test_fallback_engine_passthrough():
    """InvestigationFallbackEngine builds a valid deterministic InvestigationIntelligence."""
    fallback_engine = InvestigationFallbackEngine()
    result = await fallback_engine.analyze(_make_payload())

    assert result.crime_classification.primary_category == "cyber_fraud"
    # Gaps from missing_information + M11 timestamp highlights
    assert len(result.investigative_gaps) >= 2
    assert result.confidence_score == 0.85
    # context_id falls back to crime_type when TimelineIntelligence has no context_id field
    assert result.context_id in ("ctx_001", "cyber_fraud")


@pytest.mark.asyncio
async def test_fallback_engine_contains_no_action_plan():
    """InvestigationIntelligence must NOT have an action_plan attribute."""
    fallback_engine = InvestigationFallbackEngine()
    result = await fallback_engine.analyze(_make_payload())

    model_fields = set(result.model_fields.keys())
    assert "action_plan" not in model_fields
    assert "executive_summary" not in model_fields
    assert "complaint_understanding" in model_fields


@pytest.mark.asyncio
async def test_investigative_gaps_have_no_recommended_source():
    """MissingEvidenceGap must NOT have a recommended_source field."""
    from app.schemas.investigation_intelligence import MissingEvidenceGap
    gap_fields = set(MissingEvidenceGap.model_fields.keys())
    assert "recommended_source" not in gap_fields
    assert "description" in gap_fields
    assert "impact" in gap_fields
    assert "confidence" in gap_fields
