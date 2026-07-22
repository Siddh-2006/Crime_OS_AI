"""
ImageWorker — orchestrates the full image processing pipeline.

Steps (with structured log at every stage):
  1.  Validate image bytes
  2.  Extract metadata (PIL, deterministic)
  3.  Preprocess image (orientation, resize)
  4.  Detect text presence (Florence-2 <OCR> task)
  5a. [Text detected]    → enqueue OCR_WORKER job → build EvidenceProfile(pending_ocr)
  5b. [No text detected] → caption with Florence-2  → build EvidenceProfile(complete)

Retry strategy:
  - Transient: Florence timeout, Redis connection, queue failure → up to 3x (handled by FlorenceCaptioner/FlorenceTextDetector)
  - Non-retryable: InvalidImageError, UnsupportedFormatError → fail immediately

Payload schema:
    {
        "image_bytes_b64": str,   # base64-encoded image bytes
        "file_name": str,         # original filename
        "file_size_bytes": int    # original file size
    }
"""
from __future__ import annotations

import base64
import time

from app.base.worker import BaseWorker, ProgressUpdate
from app.core.exceptions import InvalidImageError, UnsupportedFormatError
from app.core.logging import logger
from app.image_worker.interfaces import (
    IEvidenceBuilder,
    IImageCaptioner,
    IImagePreprocessor,
    IMetadataExtractor,
    ITextDetector,
)
from app.queue.interface import IQueue
from app.queue.job import Job, JobType
from app.schemas.evidence import EvidenceProfile


class ImageWorker(BaseWorker[dict, dict]):
    """
    Orchestrates image validation, metadata extraction, preprocessing,
    text detection, Florence-2 captioning, and EvidenceProfile construction.

    Implements IImageWorker contract via BaseWorker.
    Never builds business objects directly — delegates to IEvidenceBuilder.
    """

    worker_name = "image_worker"

    def __init__(
        self,
        metadata_extractor: IMetadataExtractor,
        preprocessor: IImagePreprocessor,
        text_detector: ITextDetector,
        captioner: IImageCaptioner,
        evidence_builder: IEvidenceBuilder,
        queue: IQueue,
    ) -> None:
        super().__init__()
        self.metadata_extractor = metadata_extractor
        self.preprocessor = preprocessor
        self.text_detector = text_detector
        self.captioner = captioner
        self.evidence_builder = evidence_builder
        self.queue = queue

    async def process(self, *, job_id: str, payload: dict, attempt: int) -> dict:
        t_start = time.perf_counter()
        file_name: str = payload.get("file_name", "unknown.jpg")
        file_size_bytes: int = payload.get("file_size_bytes", 0)
        image_b64: str | None = payload.get("image_bytes_b64")

        logger.info(
            "[image_worker] Worker started",
            extra={"job_id": job_id, "file_name": file_name, "attempt": attempt},
        )

        # ── Step 1: Decode & validate ─────────────────────────────────────────
        if not image_b64:
            raise InvalidImageError("Payload must contain 'image_bytes_b64'.")
        try:
            image_bytes = base64.b64decode(image_b64)
        except Exception as exc:
            raise InvalidImageError(f"Failed to decode image bytes: {exc}")

        self.report_progress(
            ProgressUpdate(job_id=job_id, step="validating", percent=0.05, message="Validating image")
        )
        logger.info("[image_worker] Image validated", extra={"job_id": job_id, "file_name": file_name})

        # ── Step 2: Extract metadata ──────────────────────────────────────────
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="metadata_extraction", percent=0.15, message="Extracting metadata")
        )
        metadata = self.metadata_extractor.extract(image_bytes, file_name, file_size_bytes)
        logger.info(
            "[image_worker] Metadata extracted",
            extra={
                "job_id": job_id,
                "format": metadata.format,
                "width": metadata.width,
                "height": metadata.height,
                "color_mode": metadata.color_mode,
            },
        )

        # ── Step 3: Preprocess ────────────────────────────────────────────────
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="preprocessing", percent=0.30, message="Preprocessing image")
        )
        preprocessed_bytes = self.preprocessor.preprocess(image_bytes)
        logger.info("[image_worker] Preprocessing completed", extra={"job_id": job_id})

        # ── Step 4: Text detection ────────────────────────────────────────────
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="text_detection", percent=0.50, message="Detecting text presence")
        )
        text_detected = await self.text_detector.detect(preprocessed_bytes)
        logger.info(
            "[image_worker] Text detection completed",
            extra={"job_id": job_id, "text_detected": text_detected},
        )

        # ── Step 5a: Text detected → enqueue OCR job ──────────────────────────
        if text_detected:
            self.report_progress(
                ProgressUpdate(job_id=job_id, step="ocr_enqueue", percent=0.70, message="Enqueueing OCR job")
            )
            ocr_job = Job(
                job_type=JobType.OCR_WORKER,
                payload={
                    "image_bytes_b64": image_b64,
                    "file_name": file_name,
                    "source_evidence_job_id": job_id,
                },
                correlation_id=job_id,
            )
            await self.queue.enqueue(ocr_job)
            logger.info(
                "[image_worker] OCR job queued",
                extra={"job_id": job_id, "ocr_job_id": ocr_job.job_id},
            )

            duration_ms = (time.perf_counter() - t_start) * 1000
            profile = self.evidence_builder.build(
                file_name=file_name,
                metadata=metadata,
                analysis=None,
                text_detected=True,
                ocr_job_id=ocr_job.job_id,
                status="pending_ocr",
                processing_duration_ms=duration_ms,
            )
            logger.info(
                "[image_worker] EvidenceProfile generated (pending_ocr)",
                extra={"job_id": job_id, "evidence_id": profile.evidence_id, "duration_ms": round(duration_ms, 2)},
            )
            logger.info("[image_worker] Processing completed", extra={"job_id": job_id, "duration_ms": round(duration_ms, 2)})
            return profile.model_dump(mode="json")

        # ── Step 5b: No text → Florence captioning ────────────────────────────
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="florence_inference", percent=0.70, message="Running Florence-2 inference")
        )
        logger.info("[image_worker] Florence inference started", extra={"job_id": job_id})
        analysis = await self.captioner.caption(preprocessed_bytes)
        logger.info(
            "[image_worker] Florence inference completed",
            extra={"job_id": job_id, "scene_type": analysis.scene_type, "tags": analysis.tags},
        )

        # ── Step 6: Build EvidenceProfile ─────────────────────────────────────
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="build_evidence", percent=0.90, message="Building EvidenceProfile")
        )
        duration_ms = (time.perf_counter() - t_start) * 1000
        profile = self.evidence_builder.build(
            file_name=file_name,
            metadata=metadata,
            analysis=analysis,
            text_detected=False,
            ocr_job_id=None,
            status="complete",
            processing_duration_ms=duration_ms,
        )

        self.report_progress(
            ProgressUpdate(job_id=job_id, step="completed", percent=1.0, message="Image processing complete")
        )
        logger.info(
            "[image_worker] EvidenceProfile generated (complete)",
            extra={"job_id": job_id, "evidence_id": profile.evidence_id, "duration_ms": round(duration_ms, 2)},
        )
        logger.info("[image_worker] Processing completed", extra={"job_id": job_id, "duration_ms": round(duration_ms, 2)})
        return profile.model_dump(mode="json")
