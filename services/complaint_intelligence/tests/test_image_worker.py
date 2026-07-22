"""
Tests for ImageWorker — full pipeline with mock interfaces.

Unit tests: mock Florence (captioner and text detector), mock queue.
Business logic is tested independently of all external dependencies.
"""
from __future__ import annotations

import base64

import pytest

from app.image_worker.captioner import MockImageCaptioner
from app.image_worker.evidence_builder import EvidenceBuilder
from app.image_worker.metadata_extractor import PILMetadataExtractor
from app.image_worker.preprocessor import PILImagePreprocessor
from app.image_worker.text_detector import MockTextDetector
from app.image_worker.worker import ImageWorker
from app.queue.mock_queue import MockQueue
from app.schemas.evidence import EvidenceProfile, ImageAnalysisResult
from tests.image_test_utils import CORRUPT_BYTES, EMPTY_BYTES, make_jpeg_bytes


def _make_worker(text_detected: bool = False, caption: ImageAnalysisResult | None = None):
    return ImageWorker(
        metadata_extractor=PILMetadataExtractor(),
        preprocessor=PILImagePreprocessor(),
        text_detector=MockTextDetector(returns=text_detected),
        captioner=MockImageCaptioner(result=caption),
        evidence_builder=EvidenceBuilder(),
        queue=MockQueue(),
    )


def _b64(image_bytes: bytes) -> str:
    return base64.b64encode(image_bytes).decode("utf-8")


def _payload(image_bytes: bytes, file_name: str = "test.jpg") -> dict:
    return {
        "image_bytes_b64": _b64(image_bytes),
        "file_name": file_name,
        "file_size_bytes": len(image_bytes),
    }


@pytest.mark.asyncio
async def test_worker_no_text_returns_complete_profile():
    worker = _make_worker(text_detected=False)
    result = await worker.run(_payload(make_jpeg_bytes()), job_id="test-img-001")
    assert result.succeeded
    profile = EvidenceProfile.model_validate(result.output)
    assert profile.status == "complete"
    assert profile.text_detected is False
    assert profile.ocr_job_id is None
    assert profile.analysis is not None


@pytest.mark.asyncio
async def test_worker_text_detected_returns_pending_ocr():
    worker = _make_worker(text_detected=True)
    result = await worker.run(_payload(make_jpeg_bytes()), job_id="test-img-002")
    assert result.succeeded
    profile = EvidenceProfile.model_validate(result.output)
    assert profile.status == "pending_ocr"
    assert profile.text_detected is True
    assert profile.ocr_job_id is not None


@pytest.mark.asyncio
async def test_worker_text_detected_enqueues_ocr_job():
    queue = MockQueue()
    worker = ImageWorker(
        metadata_extractor=PILMetadataExtractor(),
        preprocessor=PILImagePreprocessor(),
        text_detector=MockTextDetector(returns=True),
        captioner=MockImageCaptioner(),
        evidence_builder=EvidenceBuilder(),
        queue=queue,
    )
    await worker.run(_payload(make_jpeg_bytes()), job_id="test-img-003")
    # OCR job must be in the queue
    enqueued = list(queue._queues.values())
    assert any(len(q) > 0 for q in enqueued)


@pytest.mark.asyncio
async def test_worker_metadata_populated_in_profile():
    worker = _make_worker(text_detected=False)
    result = await worker.run(
        _payload(make_jpeg_bytes(320, 240), "scene.jpg"), job_id="test-img-004"
    )
    assert result.succeeded
    profile = EvidenceProfile.model_validate(result.output)
    assert profile.image_metadata is not None
    assert profile.image_metadata.format == "JPEG"
    assert profile.image_metadata.width == 320
    assert profile.image_metadata.height == 240


@pytest.mark.asyncio
async def test_worker_fails_on_empty_image_bytes():
    worker = _make_worker()
    result = await worker.run(
        {"image_bytes_b64": _b64(EMPTY_BYTES), "file_name": "empty.jpg", "file_size_bytes": 0},
        job_id="test-img-005",
    )
    assert not result.succeeded


@pytest.mark.asyncio
async def test_worker_fails_on_missing_payload_key():
    worker = _make_worker()
    result = await worker.run({"file_name": "no_bytes.jpg"}, job_id="test-img-006")
    assert not result.succeeded


@pytest.mark.asyncio
async def test_worker_file_name_propagated_to_profile():
    worker = _make_worker(text_detected=False)
    result = await worker.run(_payload(make_jpeg_bytes(), "evidence001.jpg"), job_id="test-img-007")
    assert result.succeeded
    profile = EvidenceProfile.model_validate(result.output)
    assert profile.file_name == "evidence001.jpg"


@pytest.mark.asyncio
async def test_worker_no_text_analysis_is_not_none():
    """When no text detected, analysis must be populated from Florence."""
    custom_analysis = ImageAnalysisResult(
        description="A street scene.",
        scene_type="outdoor",
        tags=["street", "car"],
        confidence=0.9,
        contains_people=True,
        contains_vehicles=True,
        contains_weapons=False,
        contains_buildings=False,
        contains_documents=False,
    )
    worker = ImageWorker(
        metadata_extractor=PILMetadataExtractor(),
        preprocessor=PILImagePreprocessor(),
        text_detector=MockTextDetector(returns=False),
        captioner=MockImageCaptioner(result=custom_analysis),
        evidence_builder=EvidenceBuilder(),
        queue=MockQueue(),
    )
    result = await worker.run(_payload(make_jpeg_bytes()), job_id="test-img-008")
    assert result.succeeded
    profile = EvidenceProfile.model_validate(result.output)
    assert profile.analysis.description == "A street scene."
    assert profile.analysis.contains_people is True


@pytest.mark.asyncio
async def test_worker_duration_is_positive():
    worker = _make_worker()
    result = await worker.run(_payload(make_jpeg_bytes()), job_id="test-img-009")
    assert result.succeeded
    profile = EvidenceProfile.model_validate(result.output)
    assert profile.processing_duration_ms >= 0


@pytest.mark.asyncio
async def test_worker_evidence_id_is_uuid(result=None):
    worker = _make_worker()
    result = await worker.run(_payload(make_jpeg_bytes()), job_id="test-img-010")
    assert result.succeeded
    profile = EvidenceProfile.model_validate(result.output)
    import uuid
    uuid.UUID(profile.evidence_id)  # raises ValueError if not valid UUID
