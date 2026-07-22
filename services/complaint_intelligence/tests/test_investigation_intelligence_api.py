"""
API integration tests for GET /investigation-intelligence/health and
POST /investigation-intelligence (M12 — refined).

Tests the Intelligent Complaint Representation & Understanding endpoint.
No action plan, no executive summary assertions.
"""
from __future__ import annotations

import json
import pytest
from fastapi.testclient import TestClient

from app.llm.client import MockLLMClient


def _make_payload() -> dict:
    return {
        "complaint_profile": {
            "crime_type": "cyber_fraud",
            "priority": "high",
            "summary": "Victim transferred money after being defrauded online.",
            "missing_information": ["Bank transaction statement"],
            "recommendations": [],
            "confidence": 0.9,
        },
        "evidence_profiles": [
            {
                "evidence_id": "ev_001",
                "evidence_type": "image",
                "file_name": "bank_screenshot.jpg",
                "status": "complete",
            }
        ],
        "timeline_intelligence": {
            "intelligence_id": "ti_001",
            "timeline_id": "tl_001",
            "context_id": "ctx_001",
            "summary": "Timeline intelligence summary.",
            "refined_entries": [],
            "contradictions": [
                {
                    "contradiction_id": "c1",
                    "contradiction_type": "timestamp_mismatch",
                    "description": "Transaction timestamp differs by 2 hours.",
                    "severity": "medium",
                    "conflicting_entries": ["ev1", "ev2"],
                }
            ],
            "causal_relationships": [],
            "missing_timestamp_highlights": [],
            "confidence_score": 0.85,
        },
    }


def test_investigation_intelligence_health(client: TestClient):
    """GET /investigation-intelligence/health returns 200 and status ok."""
    resp = client.get("/investigation-intelligence/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "investigation_intelligence_engine"


def test_investigation_intelligence_post_success(
    client: TestClient, mock_llm_client: MockLLMClient
):
    """POST /investigation-intelligence returns 200 with complaint_understanding (not executive_summary)."""
    llm_payload = {
        "crime_classification": {
            "primary_category": "cyber_fraud",
            "sub_category": "phishing",
            "applicable_statutes": ["IT Act 66D"],
            "rationale": "Phishing email lured victim into fraudulent transfer.",
        },
        "complaint_understanding": "Victim defrauded via phishing scheme. Screenshot corroborates the transfer.",
        "correlated_entities": [
            {
                "entity_type": "person",
                "name_or_value": "John Doe",
                "role": "suspect",
                "corroborating_sources": ["complaint"],
            }
        ],
        "contradictions": [],
        "investigative_gaps": [
            {
                "gap_id": "g1",
                "description": "Bank transaction statement absent from evidence.",
                "impact": "Cannot verify transfer amount.",
                "confidence": 0.95,
            }
        ],
        "risk_assessment": {
            "score": 7.5,
            "level": "HIGH",
            "factors": [
                {
                    "factor_name": "High Financial Loss",
                    "severity": "high",
                    "description": "Substantial monetary transfer involved.",
                }
            ],
        },
        "confidence_score": 0.9,
        "confidence_rationale": "Direct evidence corroboration.",
    }
    mock_llm_client.default_response = f"```json\n{json.dumps(llm_payload)}\n```"

    resp = client.post("/investigation-intelligence", json=_make_payload())

    assert resp.status_code == 200
    body = resp.json()
    assert body["intelligence_id"] is not None
    assert body["crime_classification"]["primary_category"] == "cyber_fraud"
    assert "complaint_understanding" in body
    assert "action_plan" not in body
    assert "executive_summary" not in body
    assert body["risk_assessment"]["score"] == 7.5
    assert body["risk_assessment"]["level"] == "HIGH"
    # investigative_gaps must not have recommended_source
    for gap in body.get("investigative_gaps", []):
        assert "recommended_source" not in gap


def test_investigation_intelligence_post_invalid_schema_returns_422(client: TestClient):
    """POST /investigation-intelligence with missing required fields returns 422."""
    resp = client.post("/investigation-intelligence", json={"bad_field": 123})
    assert resp.status_code == 422
