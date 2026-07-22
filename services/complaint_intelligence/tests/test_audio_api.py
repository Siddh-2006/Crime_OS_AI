"""
API integration tests for POST /audio (M6).

No Whisper, no mutagen. Uses MockAudioTranscriber and MockAudioMetadataExtractor
injected via conftest DI overrides. All tests are synchronous (TestClient wraps async).
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.schemas.evidence import AudioTranscript, TranscriptSegment
from tests.audio_test_utils import (
    EMPTY_AUDIO_BYTES,
    NOT_AUDIO_BYTES,
    make_wav_bytes,
    make_silent_wav_bytes,
)

WAV_BYTES = make_wav_bytes(duration_ms=500)
SILENT_WAV_BYTES = make_silent_wav_bytes(duration_ms=500)


# ── Happy path ────────────────────────────────────────────────────────────────

@pytest.mark.unit
def test_analyze_audio_returns_200(client: TestClient):
    resp = client.post(
        "/audio",
        files=[("file", ("test.wav", WAV_BYTES, "audio/wav"))],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "complete"
    assert "transcript" in body
    assert "audio_metadata" in body
    assert body["transcript"]["detected_language"] == "en"


@pytest.mark.unit
def test_analyze_audio_response_schema_complete(client: TestClient):
    """All required top-level fields must be present in the response."""
    resp = client.post(
        "/audio",
        files=[("file", ("test.wav", WAV_BYTES, "audio/wav"))],
    )
    assert resp.status_code == 200
    body = resp.json()
    for key in (
        "audio_job_id", "evidence_id", "audio_file_name",
        "audio_metadata", "transcript", "status",
        "processing_duration_ms", "created_at",
    ):
        assert key in body, f"Missing key in response: {key}"


@pytest.mark.unit
def test_analyze_audio_metadata_populated(client: TestClient):
    resp = client.post(
        "/audio",
        files=[("file", ("recording.wav", WAV_BYTES, "audio/wav"))],
    )
    assert resp.status_code == 200
    meta = resp.json()["audio_metadata"]
    assert meta["duration_seconds"] > 0
    assert meta["mime_type"] == "audio/wav"


@pytest.mark.unit
def test_analyze_audio_file_name_propagated(client: TestClient):
    resp = client.post(
        "/audio",
        files=[("file", ("my_audio.wav", WAV_BYTES, "audio/wav"))],
    )
    assert resp.status_code == 200
    assert resp.json()["audio_file_name"] == "my_audio.wav"


@pytest.mark.unit
def test_analyze_audio_text_intelligence_job_id_present_when_speech(client: TestClient):
    """When the mock transcriber returns non-empty text, a TI job ID must appear."""
    resp = client.post(
        "/audio",
        files=[("file", ("speech.wav", WAV_BYTES, "audio/wav"))],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "complete"
    assert body["text_intelligence_job_id"] is not None


@pytest.mark.unit
def test_analyze_audio_health_returns_ok(client: TestClient):
    resp = client.get("/audio/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["worker"] == "audio_worker"
    assert body["engine"] == "faster-whisper"


# ── Validation errors ─────────────────────────────────────────────────────────

@pytest.mark.unit
def test_analyze_audio_missing_file_returns_422(client: TestClient):
    """POST with no file field → 422 Unprocessable Entity."""
    resp = client.post("/audio")
    assert resp.status_code == 422


@pytest.mark.unit
def test_analyze_audio_empty_file_returns_400(client: TestClient):
    """Empty file bytes → 400 Bad Request."""
    resp = client.post(
        "/audio",
        files=[("file", ("empty.wav", EMPTY_AUDIO_BYTES, "audio/wav"))],
    )
    assert resp.status_code == 400


@pytest.mark.unit
def test_analyze_audio_unsupported_type_returns_415(client: TestClient):
    """Non-audio MIME type → 415 Unsupported Media Type."""
    resp = client.post(
        "/audio",
        files=[("file", ("doc.pdf", b"%PDF-1.4 fake content", "application/pdf"))],
    )
    assert resp.status_code == 415


@pytest.mark.unit
def test_analyze_audio_mp3_content_type_accepted(client: TestClient):
    """audio/mpeg (MP3) should be accepted without 415."""
    resp = client.post(
        "/audio",
        files=[("file", ("clip.mp3", WAV_BYTES, "audio/mpeg"))],
    )
    # The mock transcriber handles it fine — 200 expected
    assert resp.status_code == 200


@pytest.mark.unit
def test_analyze_audio_ogg_content_type_accepted(client: TestClient):
    """audio/ogg should be accepted without 415."""
    resp = client.post(
        "/audio",
        files=[("file", ("clip.ogg", WAV_BYTES, "audio/ogg"))],
    )
    assert resp.status_code == 200


@pytest.mark.unit
def test_analyze_audio_transcript_fields_present(client: TestClient):
    """The transcript object must expose all required fields."""
    resp = client.post(
        "/audio",
        files=[("file", ("test.wav", WAV_BYTES, "audio/wav"))],
    )
    assert resp.status_code == 200
    transcript = resp.json()["transcript"]
    for key in ("detected_language", "language_probability", "raw_text", "segments"):
        assert key in transcript, f"Missing transcript field: {key}"
