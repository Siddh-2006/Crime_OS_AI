"""
Unit tests for VideoWorker (M7).

All external dependencies are mocked:
  - ISceneDetector         → MockSceneDetector
  - IKeyframeExtractor     → MockKeyframeExtractor
  - IAudioExtractor        → MockAudioExtractor (returns WAV or None)
  - IVideoMetadataExtractor → MockVideoMetadataExtractor
  - ImageWorker            → built with all mocks (MockTextDetector, MockImageCaptioner)
  - AudioWorker            → built with all mocks (MockAudioTranscriber)

Business logic (scene dispatch, frame counting, audio delegation) is
tested independently of OpenCV, PySceneDetect, Florence-2, and Whisper.
"""
from __future__ import annotations

import base64
import pytest

from app.queue.job import JobType
from app.queue.mock_queue import MockQueue
from app.schemas.evidence import SceneInfo, VideoMetadata
from app.schemas.video import FrameType, VideoWorkerOutput
from app.video_worker.audio_extractor import MockAudioExtractor
from app.video_worker.keyframe_extractor import MockKeyframeExtractor
from app.video_worker.metadata_extractor import MockVideoMetadataExtractor
from app.video_worker.scene_detector import MockSceneDetector
from app.video_worker.worker import VideoWorker
from tests.video_test_utils import (
    EMPTY_VIDEO_BYTES,
    FAKE_MP4_BYTES,
    NOT_VIDEO_BYTES,
    make_mock_audio_worker,
    make_mock_image_worker,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("utf-8")


def _make_worker(
    scenes: list[SceneInfo] | None = None,
    audio_bytes: bytes | None = b"",      # non-None → audio track present
    has_audio_metadata: bool = True,
    frames_per_scene: int = 3,
) -> VideoWorker:
    from tests.audio_test_utils import make_silent_wav_bytes
    audio = make_silent_wav_bytes() if audio_bytes == b"" else audio_bytes

    return VideoWorker(
        scene_detector=MockSceneDetector(scenes=scenes),
        keyframe_extractor=MockKeyframeExtractor(),
        audio_extractor=MockAudioExtractor(audio_bytes=audio),
        video_metadata_extractor=MockVideoMetadataExtractor(
            result=VideoMetadata(
                duration_seconds=10.0,
                fps=25.0,
                width=1280,
                height=720,
                frame_count=250,
                codec="h264",
                has_audio=has_audio_metadata,
                file_size_bytes=5_000_000,
                mime_type="video/mp4",
            )
        ),
        image_worker=make_mock_image_worker(),
        audio_worker=make_mock_audio_worker(),
        frames_per_scene=frames_per_scene,
    )


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_returns_complete_status():
    worker = _make_worker()
    result = await worker.run(
        {"video_bytes_b64": _b64(FAKE_MP4_BYTES), "file_name": "clip.mp4", "file_size_bytes": len(FAKE_MP4_BYTES)},
        job_id="v-001",
    )
    assert result.succeeded is True
    assert result.output is not None
    output = VideoWorkerOutput.model_validate(result.output)
    assert output.status == "complete"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_dispatches_image_worker_per_keyframe_3frames():
    """Default 3 frames/scene × 2 scenes = 6 ImageWorker calls → 6 VideoFrameProfiles."""
    worker = _make_worker(frames_per_scene=3)
    result = await worker.run(
        {"video_bytes_b64": _b64(FAKE_MP4_BYTES), "file_name": "clip.mp4", "file_size_bytes": len(FAKE_MP4_BYTES)},
        job_id="v-002",
    )
    assert result.succeeded is True
    output = VideoWorkerOutput.model_validate(result.output)
    # MockSceneDetector returns 2 scenes, MockKeyframeExtractor returns 3 frames per scene
    assert len(output.frame_profiles) == 6
    assert output.total_keyframes_processed == 6


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_dispatches_image_worker_per_keyframe_1frame():
    """1 frame/scene × 2 scenes = 2 ImageWorker calls."""
    worker = _make_worker(frames_per_scene=1)
    result = await worker.run(
        {"video_bytes_b64": _b64(FAKE_MP4_BYTES), "file_name": "clip.mp4", "file_size_bytes": len(FAKE_MP4_BYTES)},
        job_id="v-003",
    )
    assert result.succeeded is True
    output = VideoWorkerOutput.model_validate(result.output)
    assert len(output.frame_profiles) == 2
    assert output.total_keyframes_processed == 2


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_frame_types_include_start_middle_end():
    """3-frame mode must produce start, middle, end frames per scene."""
    worker = _make_worker(frames_per_scene=3)
    result = await worker.run(
        {"video_bytes_b64": _b64(FAKE_MP4_BYTES), "file_name": "clip.mp4", "file_size_bytes": len(FAKE_MP4_BYTES)},
        job_id="v-004",
    )
    output = VideoWorkerOutput.model_validate(result.output)
    scene_0_frames = [fp for fp in output.frame_profiles if fp.scene_index == 0]
    frame_types = {fp.frame_type for fp in scene_0_frames}
    assert FrameType.START in frame_types
    assert FrameType.MIDDLE in frame_types
    assert FrameType.END in frame_types


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_dispatches_audio_worker_when_audio_present():
    """When MockAudioExtractor returns WAV bytes, audio_output must be populated."""
    from tests.audio_test_utils import make_wav_bytes
    worker = _make_worker(audio_bytes=make_wav_bytes())
    result = await worker.run(
        {"video_bytes_b64": _b64(FAKE_MP4_BYTES), "file_name": "clip.mp4", "file_size_bytes": len(FAKE_MP4_BYTES)},
        job_id="v-005",
    )
    assert result.succeeded is True
    output = VideoWorkerOutput.model_validate(result.output)
    assert output.audio_output is not None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_skips_audio_when_no_audio_track():
    """When MockAudioExtractor returns None, audio_output must be None."""
    worker = _make_worker(audio_bytes=None)
    result = await worker.run(
        {"video_bytes_b64": _b64(FAKE_MP4_BYTES), "file_name": "clip.mp4", "file_size_bytes": len(FAKE_MP4_BYTES)},
        job_id="v-006",
    )
    assert result.succeeded is True
    output = VideoWorkerOutput.model_validate(result.output)
    assert output.audio_output is None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_scenes_present_in_output():
    """Scene boundaries detected by MockSceneDetector must appear in the output."""
    worker = _make_worker()
    result = await worker.run(
        {"video_bytes_b64": _b64(FAKE_MP4_BYTES), "file_name": "clip.mp4", "file_size_bytes": len(FAKE_MP4_BYTES)},
        job_id="v-007",
    )
    output = VideoWorkerOutput.model_validate(result.output)
    assert len(output.scenes) == 2
    assert output.scenes[0].scene_index == 0
    assert output.scenes[1].scene_index == 1


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_single_scene_video():
    """VideoWorker handles videos with a single scene (1 scene, 3 keyframes)."""
    single = [SceneInfo(scene_index=0, start_time_s=0.0, end_time_s=30.0)]
    worker = _make_worker(scenes=single, frames_per_scene=3)
    result = await worker.run(
        {"video_bytes_b64": _b64(FAKE_MP4_BYTES), "file_name": "short.mp4", "file_size_bytes": len(FAKE_MP4_BYTES)},
        job_id="v-008",
    )
    assert result.succeeded is True
    output = VideoWorkerOutput.model_validate(result.output)
    assert len(output.scenes) == 1
    assert len(output.frame_profiles) == 3


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_metadata_populated_in_output():
    """VideoMetadata from MockVideoMetadataExtractor must appear in the output."""
    worker = _make_worker()
    result = await worker.run(
        {"video_bytes_b64": _b64(FAKE_MP4_BYTES), "file_name": "meta.mp4", "file_size_bytes": len(FAKE_MP4_BYTES)},
        job_id="v-009",
    )
    output = VideoWorkerOutput.model_validate(result.output)
    assert output.video_metadata.duration_seconds == 10.0
    assert output.video_metadata.fps == 25.0
    assert output.video_metadata.width == 1280
    assert output.video_metadata.height == 720
    assert output.video_metadata.codec == "h264"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_empty_payload_fails():
    """Empty base64-encoded bytes must cause a graceful failure (not crash)."""
    worker = _make_worker()
    result = await worker.run(
        {"video_bytes_b64": _b64(EMPTY_VIDEO_BYTES), "file_name": "empty.mp4", "file_size_bytes": 0},
        job_id="v-010",
    )
    assert result.succeeded is False
    assert result.error is not None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_missing_payload_key_fails():
    """Missing video_bytes_b64 key must cause a graceful failure."""
    worker = _make_worker()
    result = await worker.run(
        {"file_name": "missing.mp4"},
        job_id="v-011",
    )
    assert result.succeeded is False
    assert result.error is not None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_output_has_evidence_id():
    """VideoWorkerOutput must have a valid UUID as evidence_id."""
    import uuid
    worker = _make_worker()
    result = await worker.run(
        {"video_bytes_b64": _b64(FAKE_MP4_BYTES), "file_name": "ev.mp4", "file_size_bytes": len(FAKE_MP4_BYTES)},
        job_id="v-012",
    )
    output = VideoWorkerOutput.model_validate(result.output)
    uuid.UUID(output.evidence_id)   # raises if not valid UUID


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_frame_profiles_have_image_job_ids():
    """Each VideoFrameProfile must have a non-empty image_job_id."""
    worker = _make_worker(frames_per_scene=3)
    result = await worker.run(
        {"video_bytes_b64": _b64(FAKE_MP4_BYTES), "file_name": "jids.mp4", "file_size_bytes": len(FAKE_MP4_BYTES)},
        job_id="v-013",
    )
    output = VideoWorkerOutput.model_validate(result.output)
    for fp in output.frame_profiles:
        assert fp.image_job_id, "image_job_id must be non-empty"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_file_name_in_output():
    """The original filename must be reflected in the output."""
    worker = _make_worker()
    result = await worker.run(
        {"video_bytes_b64": _b64(FAKE_MP4_BYTES), "file_name": "my_evidence.mp4", "file_size_bytes": len(FAKE_MP4_BYTES)},
        job_id="v-014",
    )
    output = VideoWorkerOutput.model_validate(result.output)
    assert output.video_file_name == "my_evidence.mp4"
