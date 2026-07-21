"""
EvidenceBuilder — constructs EvidenceProfile from its component parts.

The Image Worker orchestrates the pipeline but never directly builds
business objects. That responsibility belongs exclusively here.
Single responsibility: object construction and validation.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.image_worker.interfaces import IEvidenceBuilder
from app.schemas.evidence import EvidenceProfile, ImageAnalysisResult, ImageMetadata


class EvidenceBuilder(IEvidenceBuilder):
    """
    Assembles an EvidenceProfile from validated pipeline outputs.
    Generates a unique UUID evidence_id on every call.
    Pure business logic — no I/O, no AI.
    """

    def build(
        self,
        *,
        file_name: str,
        metadata: ImageMetadata | None,
        analysis: ImageAnalysisResult | None,
        text_detected: bool,
        ocr_job_id: str | None,
        status: str,
        processing_duration_ms: float,
    ) -> EvidenceProfile:
        return EvidenceProfile(
            evidence_id=str(uuid.uuid4()),
            evidence_type="image",
            file_name=file_name,
            image_metadata=metadata,
            analysis=analysis,
            text_detected=text_detected,
            ocr_job_id=ocr_job_id,
            status=status,
            processing_duration_ms=round(processing_duration_ms, 2),
            created_at=datetime.now(timezone.utc),
        )
