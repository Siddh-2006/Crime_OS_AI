"""
API integration tests for POST /video and GET /video/health (M7).

All processing is mocked via conftest DI overrides (no OpenCV, no PySceneDetect,
no Florence-2, no Whisper). Tests verify HTTP layer behaviour only.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.video_test_utils import EMPTY_VIDEO_BYTES, FAKE_MP4_BYTES, NOT_VIDEO_BYTES


# ── Health check ──────────────────────────────────────────────────────────────

@pytest.mark.unit
def test_analyze_video_health_returns_ok(client: TestClient):
    resp = client.get("/video/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["worker"] == "video_worker"


# ── Happy path ────────────────────────────────────────────────────────────────

@pytest.mark.unit
def test_analyze_video_returns_200(client: TestClient):
    resp = client.post(
        "/video",
        files=[("file", ("clip.mp4", FAKE_MP4_BYTES, "video/mp4"))],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "complete"


@pytest.mark.unit
def test_analyze_video_response_schema_complete(client: TestClient):
    """All required top-level fields must be present."""
    resp = client.post(
        "/video",
        files=[("file", ("clip.mp4", FAKE_MP4_BYTES, "video/mp4"))],
    )
    assert resp.status_code == 200
    body = resp.json()
    for key in (
        "video_job_id", "evidence_id", "video_file_name",
        "video_metadata", "scenes", "frame_profiles",
        "status", "total_keyframes_processed",
        "processing_duration_ms", "created_at",
    ):
        assert key in body, f"Missing key: {key}"


@pytest.mark.unit
def test_analyze_video_metadata_populated(client: TestClient):
    resp = client.post(
        "/video",
        files=[("file", ("clip.mp4", FAKE_MP4_BYTES, "video/mp4"))],
    )
    assert resp.status_code == 200
    meta = resp.json()["video_metadata"]
    assert meta["duration_seconds"] > 0
    assert meta["fps"] > 0
    assert meta["width"] > 0
    assert meta["height"] > 0


@pytest.mark.unit
def test_analyze_video_scenes_present(client: TestClient):
    """MockSceneDetector returns 2 scenes — they must appear in the response."""
    resp = client.post(
        "/video",
        files=[("file", ("clip.mp4", FAKE_MP4_BYTES, "video/mp4"))],
    )
    assert resp.status_code == 200
    scenes = resp.json()["scenes"]
    assert isinstance(scenes, list)
    assert len(scenes) >= 1


@pytest.mark.unit
def test_analyze_video_frame_profiles_present(client: TestClient):
    """Frame profiles (ImageWorker results) must be non-empty in the response."""
    resp = client.post(
        "/video",
        files=[("file", ("clip.mp4", FAKE_MP4_BYTES, "video/mp4"))],
    )
    assert resp.status_code == 200
    profiles = resp.json()["frame_profiles"]
    assert isinstance(profiles, list)
    assert len(profiles) > 0


@pytest.mark.unit
def test_analyze_video_file_name_propagated(client: TestClient):
    resp = client.post(
        "/video",
        files=[("file", ("my_clip.mp4", FAKE_MP4_BYTES, "video/mp4"))],
    )
    assert resp.status_code == 200
    assert resp.json()["video_file_name"] == "my_clip.mp4"


@pytest.mark.unit
def test_analyze_video_mov_content_type_accepted(client: TestClient):
    resp = client.post(
        "/video",
        files=[("file", ("clip.mov", FAKE_MP4_BYTES, "video/quicktime"))],
    )
    assert resp.status_code == 200


@pytest.mark.unit
def test_analyze_video_webm_content_type_accepted(client: TestClient):
    resp = client.post(
        "/video",
        files=[("file", ("clip.webm", FAKE_MP4_BYTES, "video/webm"))],
    )
    assert resp.status_code == 200


# ── Validation errors ─────────────────────────────────────────────────────────

@pytest.mark.unit
def test_analyze_video_missing_file_returns_422(client: TestClient):
    resp = client.post("/video")
    assert resp.status_code == 422


@pytest.mark.unit
def test_analyze_video_empty_file_returns_400(client: TestClient):
    resp = client.post(
        "/video",
        files=[("file", ("empty.mp4", EMPTY_VIDEO_BYTES, "video/mp4"))],
    )
    assert resp.status_code == 400


@pytest.mark.unit
def test_analyze_video_unsupported_type_returns_415(client: TestClient):
    """Non-video MIME type → 415 Unsupported Media Type."""
    resp = client.post(
        "/video",
        files=[("file", ("doc.pdf", b"%PDF-1.4 fake", "application/pdf"))],
    )
    assert resp.status_code == 415
