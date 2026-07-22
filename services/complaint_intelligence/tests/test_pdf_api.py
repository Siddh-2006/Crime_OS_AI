"""
API integration tests for POST /pdf and GET /pdf/health (M8).

Mock DI overrides in conftest.py handle all processing.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.pdf_test_utils import EMPTY_PDF_BYTES, FAKE_PDF_BYTES


@pytest.mark.unit
def test_analyze_pdf_health_returns_ok(client: TestClient):
    resp = client.get("/pdf/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["worker"] == "pdf_worker"


@pytest.mark.unit
def test_analyze_pdf_returns_200(client: TestClient):
    resp = client.post(
        "/pdf",
        files=[("file", ("document.pdf", FAKE_PDF_BYTES, "application/pdf"))],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "complete"


@pytest.mark.unit
def test_analyze_pdf_response_schema_complete(client: TestClient):
    resp = client.post(
        "/pdf",
        files=[("file", ("document.pdf", FAKE_PDF_BYTES, "application/pdf"))],
    )
    assert resp.status_code == 200
    body = resp.json()
    for key in (
        "pdf_job_id", "evidence_id", "pdf_file_name",
        "pdf_metadata", "pages", "merged_text",
        "status", "processing_duration_ms", "created_at",
    ):
        assert key in body, f"Missing key: {key}"


@pytest.mark.unit
def test_analyze_pdf_metadata_populated(client: TestClient):
    resp = client.post(
        "/pdf",
        files=[("file", ("document.pdf", FAKE_PDF_BYTES, "application/pdf"))],
    )
    assert resp.status_code == 200
    meta = resp.json()["pdf_metadata"]
    assert meta["page_count"] > 0
    assert meta["mime_type"] == "application/pdf"


@pytest.mark.unit
def test_analyze_pdf_pages_present(client: TestClient):
    resp = client.post(
        "/pdf",
        files=[("file", ("document.pdf", FAKE_PDF_BYTES, "application/pdf"))],
    )
    assert resp.status_code == 200
    pages = resp.json()["pages"]
    assert isinstance(pages, list)
    assert len(pages) > 0


@pytest.mark.unit
def test_analyze_pdf_missing_file_returns_422(client: TestClient):
    resp = client.post("/pdf")
    assert resp.status_code == 422


@pytest.mark.unit
def test_analyze_pdf_empty_file_returns_400(client: TestClient):
    resp = client.post(
        "/pdf",
        files=[("file", ("empty.pdf", EMPTY_PDF_BYTES, "application/pdf"))],
    )
    assert resp.status_code == 400


@pytest.mark.unit
def test_analyze_pdf_unsupported_type_returns_415(client: TestClient):
    resp = client.post(
        "/pdf",
        files=[("file", ("image.png", b"\x89PNG...", "image/png"))],
    )
    assert resp.status_code == 415
