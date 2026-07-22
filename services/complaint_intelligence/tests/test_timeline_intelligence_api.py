"""
API integration tests for GET /timeline-intelligence/health and
POST /timeline-intelligence (M11).

Uses MockLLMClient injected via conftest container override.
No Ollama dependency required.
"""
from __future__ import annotations

import json
import uuid

import pytest
from fastapi.testclient import TestClient

from app.llm.client import MockLLMClient
from app.schemas.timeline import ParsedDateTime, Timeline, TimelineEntry, TimestampPrecision


def _make_parsed_time(iso: str = "2026-07-20T10:00:00Z") -> dict:
    return {
        "iso_timestamp_utc": iso,
        "year": 2026,
        "month": 7,
        "day": 20,
        "hour": 10,
        "minute": 0,
        "second": 0,
        "precision": "second",
        "raw_text": "20 July 2026 10:00",
    }


def _make_payload(
    *,
    entry_id: str | None = None,
    event_id: str = "ev1",
    unparsed: bool = False,
) -> dict:
    eid = entry_id or str(uuid.uuid4())
    parsed_time = (
        {"precision": "unparsed", "raw_text": "unknown time"}
        if unparsed
        else _make_parsed_time()
    )
    return {
        "complaint_profile": {
            "crime_type": "cyber_fraud",
            "priority": "high",
            "summary": "Victim transferred money after being defrauded.",
            "missing_information": [],
            "recommendations": [],
            "confidence": 0.9,
        },
        "timeline": {
            "timeline_id": str(uuid.uuid4()),
            "context_id": "ctx_api",
            "entries": [
                {
                    "entry_id": eid,
                    "event_id": event_id,
                    "description": "Victim transferred Rs 50,000 to fraudster.",
                    "actors": ["Victim"],
                    "action": "transfer",
                    "raw_timestamp": None if unparsed else "20 July 2026",
                    "parsed_time": parsed_time,
                    "location": "Mumbai",
                    "sources": ["complaint"],
                    "confidence": 1.0,
                }
            ],
            "start_time": None if unparsed else "2026-07-20T10:00:00Z",
            "end_time": None if unparsed else "2026-07-20T10:00:00Z",
            "total_events": 1,
            "unparsed_count": 1 if unparsed else 0,
        },
        "evidence_references": [],
    }


def _llm_response_for(payload: dict) -> str:
    entry = payload["timeline"]["entries"][0]
    return json.dumps({
        "summary": "The victim transferred Rs 50,000 to the fraudster on 20 July 2026.",
        "refined_entries": [
            {
                "entry_id": entry["entry_id"],
                "event_id": entry["event_id"],
                "original_description": entry["description"],
                "refined_description": "The victim transferred Rs 50,000.",
                "resolved_actors": entry["actors"],
                "action": entry["action"],
                "parsed_time": entry["parsed_time"],
                "location": entry["location"],
                "sources": entry["sources"],
            }
        ],
        "contradictions": [],
        "causal_relationships": [],
        "missing_timestamp_highlights": [],
    })


# ────────────────────────────────────────────────────────────────────────────
# Health
# ────────────────────────────────────────────────────────────────────────────

@pytest.mark.unit
def test_timeline_intelligence_health(client: TestClient):
    resp = client.get("/timeline-intelligence/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "timeline_intelligence_engine"
    assert body["llm_used"] is True


# ────────────────────────────────────────────────────────────────────────────
# POST /timeline-intelligence
# ────────────────────────────────────────────────────────────────────────────

@pytest.mark.unit
def test_timeline_intelligence_post_success(app, mock_llm_client: MockLLMClient):
    """Valid payload → 200 with TimelineIntelligence response."""
    payload = _make_payload(event_id="ev_api_1")
    mock_llm_client.default_response = _llm_response_for(payload)

    from app.core.container import get_container
    from app.timeline_intelligence.engine import TimelineIntelligenceEngine
    container = get_container()
    container.llm_client = mock_llm_client
    # Inject a fresh engine wired to the mock LLM client
    container.timeline_intelligence_engine = TimelineIntelligenceEngine(llm_client=mock_llm_client)

    from fastapi.testclient import TestClient
    with TestClient(app, raise_server_exceptions=True) as client:
        resp = client.post("/timeline-intelligence", json=payload)

    assert resp.status_code == 200
    body = resp.json()
    assert "intelligence_id" in body
    assert "timeline_id" in body
    assert "summary" in body
    assert "refined_entries" in body
    assert len(body["refined_entries"]) == 1
    assert "The victim transferred" in body["refined_entries"][0]["refined_description"]


@pytest.mark.unit
def test_timeline_intelligence_post_invalid_schema_returns_422(client: TestClient):
    resp = client.post("/timeline-intelligence", json={"invalid": "payload"})
    assert resp.status_code == 422


@pytest.mark.unit
def test_timeline_intelligence_post_empty_timeline_ok(app, mock_llm_client: MockLLMClient):
    """Empty timeline → 200 (not an error)."""
    payload = {
        "complaint_profile": {
            "crime_type": "theft",
            "priority": "low",
            "summary": "Wallet stolen.",
            "missing_information": [],
            "recommendations": [],
            "confidence": 0.7,
        },
        "timeline": {
            "timeline_id": str(uuid.uuid4()),
            "context_id": "ctx_empty",
            "entries": [],
            "start_time": None,
            "end_time": None,
            "total_events": 0,
            "unparsed_count": 0,
        },
        "evidence_references": [],
    }
    mock_llm_client.default_response = json.dumps({
        "summary": "No events.",
        "refined_entries": [],
        "contradictions": [],
        "causal_relationships": [],
        "missing_timestamp_highlights": [],
    })

    from app.core.container import get_container
    from app.timeline_intelligence.engine import TimelineIntelligenceEngine
    container = get_container()
    container.llm_client = mock_llm_client
    container.timeline_intelligence_engine = TimelineIntelligenceEngine(llm_client=mock_llm_client)

    from fastapi.testclient import TestClient
    with TestClient(app, raise_server_exceptions=True) as client:
        resp = client.post("/timeline-intelligence", json=payload)

    assert resp.status_code == 200
    body = resp.json()
    assert body["refined_entries"] == []


@pytest.mark.unit
def test_timeline_intelligence_always_highlights_unparsed(app, mock_llm_client: MockLLMClient):
    """UNPARSED timestamps are always highlighted regardless of LLM response."""
    payload = _make_payload(event_id="ev_unparsed", unparsed=True)
    # LLM returns no missing highlights
    mock_llm_client.default_response = json.dumps({
        "summary": "Unknown time event.",
        "refined_entries": [],
        "contradictions": [],
        "causal_relationships": [],
        "missing_timestamp_highlights": [],
    })

    from app.core.container import get_container
    from app.timeline_intelligence.engine import TimelineIntelligenceEngine
    container = get_container()
    container.llm_client = mock_llm_client
    container.timeline_intelligence_engine = TimelineIntelligenceEngine(llm_client=mock_llm_client)

    from fastapi.testclient import TestClient
    with TestClient(app, raise_server_exceptions=True) as client:
        resp = client.post("/timeline-intelligence", json=payload)

    assert resp.status_code == 200
    body = resp.json()
    highlights = body.get("missing_timestamp_highlights", [])
    ev_ids = [h["event_id"] for h in highlights]
    assert "ev_unparsed" in ev_ids
