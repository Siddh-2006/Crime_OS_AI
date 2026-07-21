"""
Tests for EvidenceBuilder.
"""
from __future__ import annotations

import pytest

from app.image_worker.evidence_builder import EvidenceBuilder
from app.schemas.evidence import ImageAnalysisResult, ImageMetadata


@pytest.fixture
def builder() -> EvidenceBuilder:
    return EvidenceBuilder()


def _make_metadata(**kwargs) -> ImageMetadata:
    defaults = dict(
        format="JPEG",
        width=800,
        height=600,
        color_mode="RGB",
        file_size_bytes=204800,
        mime_type="image/jpeg",
        exif_timestamp=None,
        gps_coordinates=None,
        camera_make=None,
        camera_model=None,
    )
    defaults.update(kwargs)
    return ImageMetadata(**defaults)


def _make_analysis(**kwargs) -> ImageAnalysisResult:
    defaults = dict(
        description="A scene.",
        scene_type="outdoor",
        tags=["car"],
        confidence=0.85,
        contains_people=False,
        contains_vehicles=True,
        contains_weapons=False,
        contains_buildings=False,
        contains_documents=False,
    )
    defaults.update(kwargs)
    return ImageAnalysisResult(**defaults)


def test_build_complete_profile(builder):
    profile = builder.build(
        file_name="scene.jpg",
        metadata=_make_metadata(),
        analysis=_make_analysis(),
        text_detected=False,
        ocr_job_id=None,
        status="complete",
        processing_duration_ms=123.4,
    )
    assert profile.status == "complete"
    assert profile.evidence_type == "image"
    assert profile.file_name == "scene.jpg"
    assert profile.analysis is not None
    assert profile.ocr_job_id is None
    assert profile.text_detected is False
    assert profile.processing_duration_ms == 123.4


def test_build_pending_ocr_profile(builder):
    profile = builder.build(
        file_name="document.jpg",
        metadata=_make_metadata(),
        analysis=None,
        text_detected=True,
        ocr_job_id="job-abc-123",
        status="pending_ocr",
        processing_duration_ms=45.0,
    )
    assert profile.status == "pending_ocr"
    assert profile.text_detected is True
    assert profile.ocr_job_id == "job-abc-123"
    assert profile.analysis is None


def test_build_generates_unique_evidence_ids(builder):
    meta = _make_metadata()
    ids = {
        builder.build(
            file_name="x.jpg", metadata=meta, analysis=None,
            text_detected=False, ocr_job_id=None, status="complete",
            processing_duration_ms=1.0,
        ).evidence_id
        for _ in range(5)
    }
    assert len(ids) == 5


def test_build_without_metadata(builder):
    """EvidenceProfile should be valid even when metadata is None."""
    profile = builder.build(
        file_name="unknown.jpg",
        metadata=None,
        analysis=None,
        text_detected=False,
        ocr_job_id=None,
        status="complete",
        processing_duration_ms=0.5,
    )
    assert profile.image_metadata is None
    assert profile.evidence_id is not None


def test_build_created_at_is_utc(builder):
    from datetime import timezone
    profile = builder.build(
        file_name="ts.jpg", metadata=_make_metadata(), analysis=_make_analysis(),
        text_detected=False, ocr_job_id=None, status="complete",
        processing_duration_ms=10.0,
    )
    assert profile.created_at.tzinfo == timezone.utc
