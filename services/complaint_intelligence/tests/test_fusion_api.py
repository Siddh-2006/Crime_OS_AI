"""
API integration tests for GET /fusion/health and POST /fusion (M9).
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.mark.unit
def test_fusion_health_returns_ok(client: TestClient):
    resp = client.get("/fusion/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "intelligence_fusion"


@pytest.mark.unit
def test_fusion_post_returns_200(client: TestClient):
    payload = {
        "complaint_profile": {
            "crime_type": "missing_person",
            "priority": "critical",
            "summary": "Child missing from park since evening.",
            "missing_information": [],
            "recommendations": ["Search CCTV footage", "Notify nearby checkposts"],
            "confidence": 0.98,
        },
        "entities": [
            {"entity_type": "PERSON", "value": "Aarav Sharma", "source": "complaint"},
            {"entity_type": "GPE", "value": "Central Park", "source": "complaint"},
        ],
        "events": [
            {
                "event_id": "e1",
                "description": "Aarav went missing near ice cream stall",
                "actors": ["Aarav Sharma"],
                "action": "missing",
                "timestamp": "2026-07-21 17:30",
            }
        ],
        "evidence_references": [
            {"evidence_id": "img_001", "evidence_type": "image", "file_name": "park_cctv.jpg"}
        ],
    }

    resp = client.post("/fusion", json=payload)
    assert resp.status_code == 200
    body = resp.json()

    assert "context_id" in body
    assert body["complaint_profile"]["crime_type"] == "missing_person"
    assert body["total_entities_fused"] == 2
    assert body["total_events_fused"] == 1
    assert len(body["evidence_sources"]) == 1
    assert body["evidence_sources"][0]["file_name"] == "park_cctv.jpg"


@pytest.mark.unit
def test_fusion_post_invalid_schema_returns_422(client: TestClient):
    resp = client.post("/fusion", json={"invalid": "payload"})
    assert resp.status_code == 422
