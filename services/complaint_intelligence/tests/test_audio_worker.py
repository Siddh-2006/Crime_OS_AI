"""
Unit tests for AudioWorker (M6).

All external dependencies are mocked:
  - IAudioTranscriber  → MockAudioTranscriber
  - IAudioMetadataExtractor → MockAudioMetadataExtractor
  - IQueue             → MockQueue

Business logic is tested independently of Whisper, mutagen, and Redis.
"""
from __future__ import annotations

import base64
import pytest

from app.audio_worker.metadata_extractor import MockAudioMetadataExtractor
from app.audio_worker.transcriber import MockAudioTranscriber
from app.audio_worker.worker import AudioWorker
from app.queue.mock_queue import MockQueue
from app.queue.job import JobType
from app.schemas.audio import AudioWorkerOutput
from app.schemas.evidence import AudioMetadata, AudioTranscript, TranscriptSegment
from tests.audio_test_utils import (
    EMPTY_AUDIO_BYTES,
    NOT_AUDIO_BYTES,
    make_wav_bytes,
    make_silent_wav_bytes,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("utf-8")


def _make_worker(
    transcript: AudioTranscript | None = None,
    metadata: AudioMetadata | None = None,
    queue: MockQueue | None = None,
) -> tuple[AudioWorker, MockQueue]:
    q = queue or MockQueue()
    worker = AudioWorker(
        transcriber=MockAudioTranscriber(default_transcript=transcript),
        metadata_extractor=MockAudioMetadataExtractor(result=metadata),
        queue=q,
    )
    return worker, q


def _english_transcript() -> AudioTranscript:
    return AudioTranscript(
        detected_language="en",
        language_probability=0.99,
        raw_text="I lost money online via a fake link.",
        translated_text=None,
        segments=[
            TranscriptSegment(start=0.0, end=2.5, text="I lost money online via a fake link.", confidence=0.92),
        ],
    )


def _hindi_transcript() -> AudioTranscript:
    return AudioTranscript(
        detected_language="hi",
        language_probability=0.97,
        raw_text="मेरा बटुआ चोरी हो गया है।",
        translated_text="My wallet has been stolen.",
        segments=[
            TranscriptSegment(start=0.0, end=2.0, text="मेरा बटुआ चोरी हो गया है।", confidence=0.89),
        ],
    )


def _silent_transcript() -> AudioTranscript:
    return AudioTranscript(
        detected_language="en",
        language_probability=0.5,
        raw_text="",        # empty → no speech
        translated_text=None,
        segments=[],
    )


WAV_BYTES = make_wav_bytes()


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_english_audio_returns_complete_status():
    worker, _ = _make_worker(transcript=_english_transcript())
    result = await worker.run(
        {"audio_bytes_b64": _b64(WAV_BYTES), "file_name": "evidence.wav", "file_size_bytes": len(WAV_BYTES)},
        job_id="test-audio-001",
    )

    assert result.succeeded is True
    assert result.output is not None
    output = AudioWorkerOutput.model_validate(result.output)
    assert output.status == "complete"
    assert output.audio_file_name == "evidence.wav"
    assert output.transcript.detected_language == "en"
    assert output.transcript.raw_text == "I lost money online via a fake link."
    assert output.transcript.translated_text is None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_english_audio_enqueues_text_intelligence_job():
    worker, queue = _make_worker(transcript=_english_transcript())
    result = await worker.run(
        {"audio_bytes_b64": _b64(WAV_BYTES), "file_name": "evidence.wav", "file_size_bytes": len(WAV_BYTES)},
        job_id="test-audio-002",
    )

    assert result.succeeded is True
    # One TEXT_INTELLIGENCE job should be in the queue
    ti_jobs = queue.all_jobs(job_type=JobType.TEXT_INTELLIGENCE.value)
    assert len(ti_jobs) == 1
    assert ti_jobs[0].payload["source"] == "audio"
    assert "I lost money online" in ti_jobs[0].payload["text"]


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_non_english_uses_translated_text_for_ti():
    worker, queue = _make_worker(transcript=_hindi_transcript())
    result = await worker.run(
        {"audio_bytes_b64": _b64(WAV_BYTES), "file_name": "hindi.wav", "file_size_bytes": len(WAV_BYTES)},
        job_id="test-audio-003",
    )

    assert result.succeeded is True
    assert result.output is not None
    output = AudioWorkerOutput.model_validate(result.output)
    assert output.transcript.detected_language == "hi"
    assert output.transcript.translated_text == "My wallet has been stolen."
    assert output.text_intelligence_job_id is not None

    # TI job should use the English translation, not the Hindi raw text
    ti_jobs = queue.all_jobs(job_type=JobType.TEXT_INTELLIGENCE.value)
    assert len(ti_jobs) == 1
    assert ti_jobs[0].payload["text"] == "My wallet has been stolen."


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_silent_audio_returns_no_speech_status():
    worker, queue = _make_worker(transcript=_silent_transcript())
    result = await worker.run(
        {"audio_bytes_b64": _b64(make_silent_wav_bytes()), "file_name": "silent.wav", "file_size_bytes": 100},
        job_id="test-audio-004",
    )

    assert result.succeeded is True
    assert result.output is not None
    output = AudioWorkerOutput.model_validate(result.output)
    assert output.status == "no_speech"
    assert output.text_intelligence_job_id is None
    # No TI job should be enqueued
    assert len(queue.all_jobs()) == 0


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_empty_audio_bytes_fails():
    """base64-encoding empty bytes yields an empty string — caught as missing payload."""
    worker, _ = _make_worker()
    result = await worker.run(
        {"audio_bytes_b64": _b64(EMPTY_AUDIO_BYTES), "file_name": "empty.wav", "file_size_bytes": 0},
        job_id="test-audio-005",
    )
    assert result.succeeded is False
    assert result.error is not None
    # base64("") == "" which fails the 'if not audio_b64' guard
    assert "audio_bytes_b64" in result.error or "empty" in result.error.lower()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_missing_payload_key_raises_error():
    worker, _ = _make_worker()
    result = await worker.run(
        {"file_name": "missing_bytes.wav"},   # no audio_bytes_b64
        job_id="test-audio-006",
    )
    assert result.succeeded is False
    assert result.error is not None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_metadata_populated_in_output():
    custom_metadata = AudioMetadata(
        duration_seconds=12.5,
        sample_rate=44100,
        channels=2,
        codec="mp3",
        file_size_bytes=200_000,
        mime_type="audio/mpeg",
        bit_rate=128000,
    )
    worker, _ = _make_worker(transcript=_english_transcript(), metadata=custom_metadata)
    result = await worker.run(
        {"audio_bytes_b64": _b64(WAV_BYTES), "file_name": "stereo.mp3", "file_size_bytes": 200_000},
        job_id="test-audio-007",
    )

    assert result.succeeded is True
    assert result.output is not None
    output = AudioWorkerOutput.model_validate(result.output)
    assert output.audio_metadata.duration_seconds == 12.5
    assert output.audio_metadata.sample_rate == 44100
    assert output.audio_metadata.channels == 2
    assert output.audio_metadata.codec == "mp3"
    assert output.audio_metadata.mime_type == "audio/mpeg"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_output_has_evidence_id():
    worker, _ = _make_worker(transcript=_english_transcript())
    result = await worker.run(
        {"audio_bytes_b64": _b64(WAV_BYTES), "file_name": "ev.wav", "file_size_bytes": len(WAV_BYTES)},
        job_id="test-audio-008",
    )
    assert result.succeeded is True
    assert result.output is not None
    output = AudioWorkerOutput.model_validate(result.output)
    import uuid
    uuid.UUID(output.evidence_id)   # raises ValueError if not valid UUID


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_preserves_provided_evidence_id():
    worker, _ = _make_worker(transcript=_english_transcript())
    result = await worker.run(
        {
            "audio_bytes_b64": _b64(WAV_BYTES),
            "file_name": "linked.wav",
            "file_size_bytes": len(WAV_BYTES),
            "evidence_id": "custom-evidence-id-123",
        },
        job_id="test-audio-009",
    )
    assert result.succeeded is True
    assert result.output is not None
    output = AudioWorkerOutput.model_validate(result.output)
    assert output.evidence_id == "custom-evidence-id-123"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_ti_job_payload_contains_audio_source():
    worker, queue = _make_worker(transcript=_english_transcript())
    await worker.run(
        {"audio_bytes_b64": _b64(WAV_BYTES), "file_name": "audio.wav", "file_size_bytes": len(WAV_BYTES)},
        job_id="test-audio-010",
    )
    ti_jobs = queue.all_jobs(job_type=JobType.TEXT_INTELLIGENCE.value)
    assert len(ti_jobs) == 1
    payload = ti_jobs[0].payload
    assert payload["source"] == "audio"
    assert payload["file_name"] == "audio.wav"
    assert payload["audio_job_id"] == "test-audio-010"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_transcript_segments_preserved():
    worker, _ = _make_worker(transcript=_english_transcript())
    result = await worker.run(
        {"audio_bytes_b64": _b64(WAV_BYTES), "file_name": "seg.wav", "file_size_bytes": len(WAV_BYTES)},
        job_id="test-audio-011",
    )
    assert result.succeeded is True
    assert result.output is not None
    output = AudioWorkerOutput.model_validate(result.output)
    assert len(output.transcript.segments) == 1
    seg = output.transcript.segments[0]
    assert seg.start == 0.0
    assert seg.end == 2.5
    assert seg.confidence == 0.92
