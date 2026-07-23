"""
PDFWorker — orchestrates the full PDF processing pipeline (M8).

Architectural principle:
  PDFWorker is a COORDINATOR — it never implements OCR, translation, or
  Text Intelligence logic directly. It delegates:
    - Digital page text  → IPDFTextExtractor (pymupdf)
    - Scanned page OCR   → OCRWorker (reused from M5, in-process)
    - Translation        → ITranslationEngine (reused from M5)
    - Text Intelligence  → IQueue (TextIntelligence job on merged_text)

Pipeline steps:
  1.  Decode PDF bytes (base64) + validate non-empty
  2.  Extract PDFMetadata (page_count, title, author, etc.)
  3.  For each page:
       a. Attempt pymupdf text extraction
       b. Count non-whitespace chars
       c. If chars >= threshold → DIGITAL path:
            - Detect language (ITranslationEngine.detect_language)
            - Translate to English if non-English
            - Build PDFPageResult(page_type="digital")
       d. Else → SCANNED path:
            - Render page to JPEG (IPDFPageRenderer)
            - Call OCRWorker.run() in-process on JPEG bytes
            - Build PDFPageResult(page_type="scanned", ocr_job_id=...)
  4.  Merge all English page texts → merged_text
  5.  Enqueue TextIntelligence job with merged_text
  6.  Return PDFWorkerOutput

Payload schema:
    {
        "pdf_bytes_b64":   str,   # base64-encoded PDF bytes
        "file_name":       str,   # original filename
        "file_size_bytes": int,   # original file size
    }
"""
from __future__ import annotations

import base64
import uuid

from app.base.worker import BaseWorker, ProgressUpdate
from app.core.config import settings
from app.core.logging import logger
from app.ocr_worker.interfaces import ITranslationEngine
from app.ocr_worker.worker import OCRWorker
from app.pdf_worker.interfaces import (
    IPDFMetadataExtractor,
    IPDFPageRenderer,
    IPDFTextExtractor,
)
from app.queue.interface import IQueue
from app.queue.job import Job, JobType
from app.schemas.pdf import PDFPageResult, PDFPageType, PDFWorkerOutput


class PDFWorker(BaseWorker[dict, dict]):
    """
    Coordinates PDF evidence processing.

    OCRWorker and ITranslationEngine are injected dependencies.
    PDFWorker has no direct knowledge of PaddleOCR, deep_translator, or AI.
    """

    worker_name = "pdf_worker"

    def __init__(
        self,
        text_extractor: IPDFTextExtractor,
        page_renderer: IPDFPageRenderer,
        metadata_extractor: IPDFMetadataExtractor,
        ocr_worker: OCRWorker,
        translator: ITranslationEngine,
        queue: IQueue,
        digital_char_threshold: int | None = None,
        page_render_dpi: int | None = None,
    ) -> None:
        super().__init__()
        self._text_extractor = text_extractor
        self._page_renderer = page_renderer
        self._metadata_extractor = metadata_extractor
        self._ocr_worker = ocr_worker
        self._translator = translator
        self._queue = queue
        self._threshold = digital_char_threshold or settings.PDF_DIGITAL_CHAR_THRESHOLD
        self._dpi = page_render_dpi or settings.PDF_PAGE_RENDER_DPI

    async def process(self, *, job_id: str, payload: dict, attempt: int) -> dict:
        file_name: str = payload.get("file_name", "document.pdf")
        file_size_bytes: int = payload.get("file_size_bytes", 0)
        pdf_b64: str | None = payload.get("pdf_bytes_b64")

        logger.info(
            "[pdf_worker] Worker started",
            extra={"job_id": job_id, "file_name": file_name, "attempt": attempt},
        )

        # ── Step 1: Decode & validate ────────────────────────────────────────
        if not pdf_b64:
            raise ValueError("Payload must contain 'pdf_bytes_b64'.")
        try:
            pdf_bytes = base64.b64decode(pdf_b64)
        except Exception as exc:
            raise ValueError(f"Failed to decode PDF bytes: {exc}") from exc
        if not pdf_bytes:
            raise ValueError("PDF payload is empty.")

        # ── Step 2: Extract metadata ─────────────────────────────────────────
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="metadata_extraction", percent=0.05, message="Extracting PDF metadata")
        )
        pdf_metadata = self._metadata_extractor.extract(pdf_bytes, file_name, file_size_bytes)
        page_count = pdf_metadata.page_count
        evidence_id = str(uuid.uuid4())

        logger.info(
            "[pdf_worker] Metadata extracted",
            extra={"job_id": job_id, "page_count": page_count, "title": pdf_metadata.title},
        )

        # ── Step 3: Process each page ────────────────────────────────────────
        pages: list[PDFPageResult] = []
        failed = 0
        progress_step = 0.85 / max(page_count, 1)

        for i in range(page_count):
            pct = 0.10 + i * progress_step
            self.report_progress(
                ProgressUpdate(job_id=job_id, step=f"page_{i}", percent=pct, message=f"Processing page {i + 1}/{page_count}")
            )
            try:
                page_result = await self._process_page(
                    job_id=job_id,
                    pdf_bytes=pdf_bytes,
                    page_index=i,
                    file_name=file_name,
                    evidence_id=evidence_id,
                )
                pages.append(page_result)
            except Exception as exc:
                failed += 1
                logger.warning(
                    "[pdf_worker] Page processing failed",
                    extra={"job_id": job_id, "page_index": i, "error": str(exc)},
                )

        # ── Step 4: Merge text ───────────────────────────────────────────────
        english_texts = []
        for p in pages:
            effective = p.translated_text or p.raw_text
            if effective.strip():
                english_texts.append(effective)
        merged_text = "\n\n".join(english_texts)

        # ── Step 5: Set ti_job_id (legacy field, single-pass pipeline processes merged_text directly) ──
        ti_job_id: str | None = None

        # ── Step 6: Build output ─────────────────────────────────────────────
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="completed", percent=1.0, message="PDF processing complete")
        )
        status = "complete" if failed == 0 else "partial"
        output = PDFWorkerOutput(
            pdf_job_id=job_id,
            evidence_id=evidence_id,
            pdf_file_name=file_name,
            pdf_metadata=pdf_metadata,
            pages=pages,
            merged_text=merged_text,
            text_intelligence_job_id=ti_job_id,
            status=status,
        )
        logger.info(
            "[pdf_worker] Processing completed",
            extra={
                "job_id": job_id,
                "status": status,
                "total_pages": page_count,
                "failed_pages": failed,
                "ti_job_id": ti_job_id,
            },
        )
        return output.model_dump(mode="json")

    async def _process_page(
        self,
        *,
        job_id: str,
        pdf_bytes: bytes,
        page_index: int,
        file_name: str,
        evidence_id: str,
    ) -> PDFPageResult:
        """Process a single page — digital or scanned path."""
        raw_text = self._text_extractor.extract(pdf_bytes, page_index)
        non_ws_chars = len(raw_text.replace(" ", "").replace("\n", "").replace("\t", ""))

        if non_ws_chars >= self._threshold:
            # ── Digital path ─────────────────────────────────────────────────
            return await self._digital_page(
                job_id=job_id,
                page_index=page_index,
                raw_text=raw_text,
            )
        else:
            # ── Scanned path ─────────────────────────────────────────────────
            return await self._scanned_page(
                job_id=job_id,
                pdf_bytes=pdf_bytes,
                page_index=page_index,
                file_name=file_name,
                evidence_id=evidence_id,
            )

    async def _digital_page(
        self,
        *,
        job_id: str,
        page_index: int,
        raw_text: str,
    ) -> PDFPageResult:
        """Detect language + translate for a digital text page."""
        lang = await self._translator.detect_language(raw_text)
        translated: str | None = None

        if lang not in ("en", "unknown", ""):
            translated = await self._translator.translate(raw_text, lang)

        english_text = translated or raw_text
        words = english_text.split()

        logger.info(
            "[pdf_worker] Digital page processed",
            extra={"job_id": job_id, "page_index": page_index, "lang": lang, "words": len(words)},
        )
        return PDFPageResult(
            page_index=page_index,
            page_type=PDFPageType.DIGITAL,
            raw_text=raw_text,
            translated_text=translated,
            language=lang,
            word_count=len(words),
            char_count=len(english_text),
            ocr_job_id=None,
        )

    async def _scanned_page(
        self,
        *,
        job_id: str,
        pdf_bytes: bytes,
        page_index: int,
        file_name: str,
        evidence_id: str,
    ) -> PDFPageResult:
        """Render page to JPEG and run through OCRWorker."""
        jpeg_bytes = self._page_renderer.render(pdf_bytes, page_index, self._dpi)

        ocr_job_id = f"{job_id}_page{page_index}_ocr"
        ocr_payload = {
            "image_bytes_b64": base64.b64encode(jpeg_bytes).decode("utf-8"),
            "file_name": f"{file_name}_page{page_index}.jpg",
            "evidence_id": evidence_id,
        }
        ocr_result = await self._ocr_worker.run(ocr_payload, job_id=ocr_job_id)

        raw_text = ""
        translated: str | None = None
        lang: str | None = None
        word_count = 0
        char_count = 0

        if ocr_result.succeeded and ocr_result.output:
            from app.schemas.ocr import OCRWorkerOutput
            ocr_output = OCRWorkerOutput.model_validate(ocr_result.output)
            raw_text = ocr_output.ocr_result.raw_text or ""
            translated = ocr_output.ocr_result.translated_text
            lang = ocr_output.ocr_result.detected_language
            english = translated or raw_text
            word_count = len(english.split())
            char_count = len(english)

        logger.info(
            "[pdf_worker] Scanned page processed",
            extra={
                "job_id": job_id,
                "page_index": page_index,
                "ocr_job_id": ocr_job_id,
                "ocr_succeeded": ocr_result.succeeded,
                "words": word_count,
            },
        )
        return PDFPageResult(
            page_index=page_index,
            page_type=PDFPageType.SCANNED,
            raw_text=raw_text,
            translated_text=translated,
            language=lang,
            word_count=word_count,
            char_count=char_count,
            ocr_job_id=ocr_job_id,
        )
