"""
API integration tests for POST /analyze-image.

No Florence, no Redis. Uses MockImageCaptioner and MockTextDetector
via conftest dependency overrides.
"""
from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.image_worker.captioner import MockImageCaptioner
from app.image_worker.text_detector import MockTextDetector
from app.schemas.evidence import ImageAnalysisResult
from tests.image_test_utils import CORRUPT_BYTES, NOT_AN_IMAGE, make_jpeg_bytes, make_png_bytes


def _jpeg_file(width: int = 64, height: int = 64) -> tuple[str, bytes, str]:
    """Returns (field_name, bytes, content_type) for TestClient multipart."""
    return ("file", (f"test_{width}x{height}.jpg", make_jpeg_bytes(width, height), "image/jpeg"))


def _png_file(width: int = 64, height: int = 64) -> tuple[str, bytes, str]:
    return ("file", (f"test_{width}x{height}.png", make_png_bytes(width, height), "image/png"))


def test_analyze_image_returns_200_complete(client: TestClient):
    resp = client.post("/analyze-image", files=[_jpeg_file()])
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "complete"
    assert body["evidence_type"] == "image"
    assert body["text_detected"] is False
    assert body["ocr_job_id"] is None


def test_analyze_image_metadata_populated(client: TestClient):
    resp = client.post("/analyze-image", files=[_jpeg_file(320, 240)])
    assert resp.status_code == 200
    meta = resp.json()["image_metadata"]
    assert meta["format"] == "JPEG"
    assert meta["width"] == 320
    assert meta["height"] == 240


def test_analyze_image_png_accepted(client: TestClient):
    resp = client.post("/analyze-image", files=[_png_file(128, 128)])
    assert resp.status_code == 200
    assert resp.json()["image_metadata"]["format"] == "PNG"


def test_analyze_image_text_detected_returns_202(client, app):
    """Override text_detector to return True → expect 202 pending_ocr."""
    from app.api.deps import get_di_container
    from app.core.container import get_container

    container = get_container()
    container.text_detector = MockTextDetector(returns=True)
    app.dependency_overrides[get_di_container] = lambda: container

    resp = client.post("/analyze-image", files=[_jpeg_file()])
    assert resp.status_code == 202
    body = resp.json()
    assert body["status"] == "pending_ocr"
    assert body["text_detected"] is True
    assert body["ocr_job_id"] is not None

    # Restore
    container.text_detector = MockTextDetector(returns=False)


def test_analyze_image_missing_file_returns_422(client: TestClient):
    """POST with no file field → 422 Unprocessable."""
    resp = client.post("/analyze-image")
    assert resp.status_code == 422


def test_analyze_image_corrupt_image_returns_400(client: TestClient):
    """Corrupt image bytes → 400 Bad Request."""
    resp = client.post(
        "/analyze-image",
        files=[("file", ("corrupt.jpg", CORRUPT_BYTES, "image/jpeg"))],
    )
    assert resp.status_code == 400


def test_analyze_image_non_image_content_type_returns_415(client: TestClient):
    """Non-image MIME type → 415 Unsupported Media Type."""
    resp = client.post(
        "/analyze-image",
        files=[("file", ("doc.pdf", b"%PDF-1.4 fake", "application/pdf"))],
    )
    assert resp.status_code == 415


def test_analyze_image_response_schema_complete(client: TestClient):
    """Response must contain all EvidenceProfile top-level keys."""
    resp = client.post("/analyze-image", files=[_jpeg_file()])
    assert resp.status_code == 200
    body = resp.json()
    for key in (
        "evidence_id", "evidence_type", "file_name",
        "image_metadata", "analysis", "text_detected",
        "ocr_job_id", "status", "processing_duration_ms", "created_at",
    ):
        assert key in body, f"Missing key: {key}"
