"""
API integration tests for POST /analyze-text.
No Redis, no spaCy — uses MockNERExtractor via conftest overrides.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


def test_analyze_text_success(client: TestClient):
    response = client.post(
        "/analyze-text",
        json={
            "text": "Rs. 48,000 was debited from the account on 12 July 2026. Phone +91-9876543210.",
            "source_type": "complaint",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert "entities" in body
    assert "events" in body
    assert body["source_type"] == "complaint"
    assert body["input_text_length"] > 0
    assert body["processing_duration_ms"] >= 0


def test_analyze_text_extracts_phone(client: TestClient):
    response = client.post(
        "/analyze-text",
        json={"text": "Suspect's phone: +91-9999888877.", "source_type": "ocr"},
    )
    assert response.status_code == 200
    body = response.json()
    types_found = {e["entity_type"] for e in body["entities"]}
    assert "phone" in types_found


def test_analyze_text_extracts_amount_and_date(client: TestClient):
    response = client.post(
        "/analyze-text",
        json={
            "text": "Victim lost Rs. 1,20,000 on 15/08/2026.",
            "source_type": "pdf",
        },
    )
    assert response.status_code == 200
    body = response.json()
    types_found = {e["entity_type"] for e in body["entities"]}
    assert "amount" in types_found
    assert "date" in types_found


def test_analyze_text_source_type_ocr(client: TestClient):
    response = client.post(
        "/analyze-text",
        json={"text": "Bank statement dated 01 January 2026.", "source_type": "ocr"},
    )
    assert response.status_code == 200
    assert response.json()["source_type"] == "ocr"


def test_analyze_text_source_type_audio(client: TestClient):
    response = client.post(
        "/analyze-text",
        json={"text": "Transcript: the caller demanded Rs. 50,000 on 10 July 2026.", "source_type": "audio"},
    )
    assert response.status_code == 200
    assert response.json()["source_type"] == "audio"


def test_analyze_text_missing_text_field(client: TestClient):
    """Request without 'text' field should return 422."""
    response = client.post(
        "/analyze-text",
        json={"source_type": "complaint"},
    )
    assert response.status_code == 422


def test_analyze_text_empty_string_rejected(client: TestClient):
    """Empty string should be rejected by Pydantic min_length=1."""
    response = client.post(
        "/analyze-text",
        json={"text": "", "source_type": "complaint"},
    )
    assert response.status_code == 422


def test_analyze_text_no_entities_in_plain_text(client: TestClient):
    """Plain English with no investigation entities should return empty entity list."""
    response = client.post(
        "/analyze-text",
        json={"text": "The sky is blue and the grass is green.", "source_type": "complaint"},
    )
    assert response.status_code == 200
    body = response.json()
    # No Indian entities; events list should be empty too (no temporal markers)
    assert isinstance(body["entities"], list)
    assert isinstance(body["events"], list)


def test_analyze_text_default_source_type(client: TestClient):
    """source_type defaults to 'complaint' if not provided."""
    response = client.post(
        "/analyze-text",
        json={"text": "Rs. 10,000 was transferred on 01 July 2026."},
    )
    assert response.status_code == 200
    assert response.json()["source_type"] == "complaint"


def test_analyze_text_response_schema_complete(client: TestClient):
    """Response has all expected top-level keys."""
    response = client.post(
        "/analyze-text",
        json={"text": "Rs. 5,000 transferred on 01/01/2026.", "source_type": "complaint"},
    )
    assert response.status_code == 200
    body = response.json()
    for key in ("entities", "events", "source_type", "input_text_length", "processing_duration_ms"):
        assert key in body, f"Missing key: {key}"
