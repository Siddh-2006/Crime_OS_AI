"""
API integration tests for GET /timeline/health and POST /timeline (M10).
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.mark.unit
def test_timeline_health_returns_ok(client: TestClient):
    resp = client.get("/timeline/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "deterministic_timeline_engine"
    assert body["llm_used"] is False


@pytest.mark.unit
def test_timeline_post_returns_200(client: TestClient):
    payload = {
        "context_id": "ctx_api_test",
        "complaint_profile": {
            "crime_type": "cyber_fraud",
            "priority": "high",
            "summary": "Phishing fraud",
            "missing_information": [],
            "recommendations": [],
            "confidence": 0.9,
        },
        "entities": [],
        "events": [
            {
                "event_id": "ev1",
                "description": "Debit transaction",
                "actors": ["Victim"],
                "action": "debit",
                "timestamp": "2026-07-20 14:00",
                "sources": ["statement"],
            },
            {
                "event_id": "ev2",
                "description": "Complaint registered",
                "actors": ["Victim"],
                "action": "complaint",
                "timestamp": "2026-07-21 09:00",
                "sources": ["police"],
            },
        ],
        "evidence_sources": [],
        "total_entities_fused": 0,
        "total_events_fused": 2,
    }

    resp = client.post("/timeline", json=payload)
    assert resp.status_code == 200
    body = resp.json()

    assert "timeline_id" in body
    assert body["context_id"] == "ctx_api_test"
    assert body["total_events"] == 2
    assert body["start_time"] == "2026-07-20T14:00:00Z"
    assert body["end_time"] == "2026-07-21T09:00:00Z"
    assert len(body["entries"]) == 2
    assert body["entries"][0]["event_id"] == "ev1"
    assert body["entries"][1]["event_id"] == "ev2"


@pytest.mark.unit
def test_timeline_post_invalid_schema_returns_422(client: TestClient):
    resp = client.post("/timeline", json={"invalid": "schema"})
    assert resp.status_code == 422
