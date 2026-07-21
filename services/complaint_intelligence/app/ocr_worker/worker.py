"""M5 OCR Worker — Orchestrator.

OCRWorker:
  1. Decode image from payload
  2. Run PaddleOCR via IOCREngine
  3. Detect language
  4. Translate if non-English
  5. Enqueue Text Intelligence job with translated text
  6. Return OCRWorkerOutput

Retry: transient IOCREngine / translation errors only.
No retry: invalid/corrupt image bytes.
"""
from __future__ import annotations

import base64
import time
import uuid

from app.base.worker import BaseWorker, WorkerResult
from app.core.logging import logger
from app.ocr_worker.interfaces import IOCREngine, ITranslationEngine
from app.queue.interface import IQueue
from app.queue.job import JobType
from app.schemas.ocr import OCRWorkerOutput


class OCRWorker(BaseWorker):
    """
    Milestone 5 — OCR Worker.

    Receives an OCR job (image bytes + metadata), runs PaddleOCR,
    translates to English, enqueues a Text Intelligence job, and returns
    a fully structured OCRWorkerOutput.
    """

    worker_name = "ocr_worker"

    def __init__(
        self,
        ocr_engine: IOCREngine,
        translator: ITranslationEngine,
        queue: IQueue,
    ) -> None:
        self._ocr_engine = ocr_engine
        self._translator = translator
        self._queue = queue

    async def process(self, job_id: str, payload: dict, attempt: int = 1) -> dict:
        """
        Expected payload keys:
          image_bytes_b64  : str   — base64-encoded image bytes
          file_name        : str   — original filename
          evidence_id      : str   — links back to M4 EvidenceProfile
        """
        file_name = payload.get("file_name", "unknown")
        evidence_id = payload.get("evidence_id")
        image_b64 = payload.get("image_bytes_b64", "")

        logger.info(
            "[ocr_worker] Worker started",
            extra={"job_id": job_id, "file_name": file_name, "attempt": attempt},
        )

        # ── Decode image ─────────────────────────────────────────────────────
        try:
            image_bytes = base64.b64decode(image_b64)
        except Exception as exc:
            raise ValueError(f"Invalid image payload: {exc}") from exc

        if not image_bytes:
            raise ValueError("Image payload is empty")

        # ── Run OCR ──────────────────────────────────────────────────────────
        logger.info("[ocr_worker] Starting OCR inference", extra={"job_id": job_id})
        ocr_result = await self._ocr_engine.run(image_bytes)
        logger.info(
            "[ocr_worker] OCR inference completed",
            extra={
                "job_id": job_id,
                "lines": ocr_result.line_count,
                "words": ocr_result.word_count,
                "avg_confidence": ocr_result.average_confidence,
                "duration_ms": ocr_result.processing_duration_ms,
            },
        )

        # ── Detect language ──────────────────────────────────────────────────
        detected_lang = await self._translator.detect_language(ocr_result.raw_text)
        ocr_result.detected_language = detected_lang
        logger.info("[ocr_worker] Language detected", extra={"job_id": job_id, "lang": detected_lang})

        # ── Translate if non-English ─────────────────────────────────────────
        ti_text = ocr_result.raw_text
        if detected_lang not in ("en", "unknown"):
            logger.info("[ocr_worker] Translating to English", extra={"job_id": job_id, "source_lang": detected_lang})
            translated = await self._translator.translate(ocr_result.raw_text, detected_lang)
            ocr_result.translated_text = translated
            ti_text = translated
            logger.info("[ocr_worker] Translation completed", extra={"job_id": job_id})

        # ── Enqueue Text Intelligence job ────────────────────────────────────
        ti_job_id: str | None = None
        if ti_text.strip():
            ti_job_id = str(uuid.uuid4())
            ti_payload = {
                "text": ti_text,
                "source": "ocr",
                "file_name": file_name,
                "evidence_id": evidence_id,
                "ocr_job_id": job_id,
            }
            await self._queue.enqueue(
                job_type=JobType.TEXT_INTELLIGENCE,
                payload=ti_payload,
                job_id=ti_job_id,
            )
            logger.info(
                "[ocr_worker] Text Intelligence job enqueued",
                extra={"job_id": job_id, "ti_job_id": ti_job_id},
            )

        # ── Build output ─────────────────────────────────────────────────────
        output = OCRWorkerOutput(
            ocr_job_id=job_id,
            evidence_id=evidence_id,
            image_file_name=file_name,
            ocr_result=ocr_result,
            text_intelligence_job_id=ti_job_id,
            status="complete",
        )

        logger.info(
            "[ocr_worker] Processing completed",
            extra={
                "job_id": job_id,
                "lines": ocr_result.line_count,
                "words": ocr_result.word_count,
                "lang": detected_lang,
                "translated": ocr_result.translated_text is not None,
                "ti_job_id": ti_job_id,
            },
        )
        return output.model_dump()
