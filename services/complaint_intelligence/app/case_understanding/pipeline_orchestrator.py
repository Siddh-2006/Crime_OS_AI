"""
Pipeline Orchestrator — Evidence Extraction to Single Case Understanding Engine.
Processes raw uploaded files in parallel, extracts media text representations,
constructs CaseContext, and triggers the single-pass LLM Case Understanding Engine.
"""
from __future__ import annotations

import asyncio
import base64
import uuid
from typing import Any, Dict, List, Optional, Tuple

from app.case_understanding.interfaces import ICaseContextBuilder, ICaseRepository, ICaseUnderstandingEngine
from app.core.container import Container
from app.core.logging import logger
from app.schemas.case_context import CaseContext, EvidenceItem
from app.schemas.case_understanding import CaseUnderstanding


class CasePipelineOrchestrator:
    """
    Orchestrates full case submission:
    1. Categorizes uploaded evidence files by type.
    2. Runs deterministic evidence extractions (Florence-2, PaddleOCR, Whisper, PDF).
    3. Builds unified CaseContext.
    4. Runs single-pass Case Understanding Engine.
    5. Persists CaseUnderstanding JSON to MongoDB.
    """

    def __init__(
        self,
        container: Container,
        context_builder: Optional[ICaseContextBuilder] = None,
        engine: Optional[ICaseUnderstandingEngine] = None,
        repository: Optional[ICaseRepository] = None,
    ) -> None:
        self.container = container
        self.context_builder = context_builder or container.case_context_builder
        self.engine = engine or container.case_understanding_engine
        self.repository = repository or container.case_repository

    async def process_case(
        self,
        complaint_text: str,
        files: List[Tuple[str, str, bytes]],  # (filename, content_type, bytes)
        case_id: Optional[str] = None,
        complaint_metadata: Optional[Dict[str, Any]] = None,
    ) -> CaseUnderstanding:
        cid = case_id or str(uuid.uuid4())
        logger.info(
            "[orchestrator] Starting evidence pipeline orchestration",
            extra={"case_id": cid, "file_count": len(files)},
        )

        # ── Step 1: Language Detection & Translation of Complaint Text ───────
        meta = dict(complaint_metadata or {})
        translated_text = complaint_text
        try:
            from app.ocr_worker.translator import DeepTranslator
            translator = DeepTranslator()
            detected_lang = await translator.detect_language(complaint_text)
            meta["detected_language"] = detected_lang
            if detected_lang not in ("en", "unknown"):
                translated_text = await translator.translate(complaint_text, source_lang=detected_lang)
                meta["translated_complaint_text"] = translated_text
                logger.info(
                    "[orchestrator] Translated non-English complaint",
                    extra={"source_lang": detected_lang, "case_id": cid},
                )
        except Exception as exc:
            logger.warning("[orchestrator] Language translation step failed", extra={"error": str(exc)})

        # ── Step 2: Process all uploaded evidence files in parallel ──────────
        # Identifies file type (Image, PDF, Audio, Video) and dispatches to specific worker
        tasks = [self._process_single_file(filename, content_type, file_bytes) for filename, content_type, file_bytes in files]
        evidence_items: List[EvidenceItem] = []

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for res in results:
                if isinstance(res, EvidenceItem):
                    evidence_items.append(res)
                elif isinstance(res, Exception):
                    logger.warning("[orchestrator] File processing failed", extra={"error": str(res)})

        logger.info(
            "[orchestrator] Evidence extractions completed",
            extra={"case_id": cid, "successful_evidence": len(evidence_items)},
        )

        # Use translated text if available, fallback to original
        final_complaint_text = (
            f"ORIGINAL COMPLAINT ({meta.get('detected_language', 'gu')}):\n{complaint_text}\n\n"
            f"ENGLISH TRANSLATION:\n{translated_text}"
            if meta.get("translated_complaint_text") and translated_text != complaint_text
            else complaint_text
        )

        # ── Step 3: Build CaseContext ─────────────────────────────────────────
        context = self.context_builder.build(
            complaint_text=final_complaint_text,
            evidence_items=evidence_items,
            case_id=cid,
            complaint_metadata=meta,
        )

        # ── Step 4: Single-Pass LLM Analysis ──────────────────────────────────
        case_understanding = await self.engine.analyze(context)

        # ── Step 5: Persist to Database ───────────────────────────────────────
        await self.repository.save(case_understanding)

        logger.info(
            "[orchestrator] Case understanding pipeline complete",
            extra={"case_id": cid, "duration_ms": case_understanding.processing_duration_ms},
        )
        return case_understanding

    async def _process_single_file(self, filename: str, content_type: str, file_bytes: bytes) -> EvidenceItem:
        file_id = str(uuid.uuid4())
        ext = filename.split(".")[-1].lower() if "." in filename else ""
        b64 = base64.b64encode(file_bytes).decode("utf-8")

        # ── Images ───────────────────────────────────────────────────────────
        if ext in ("png", "jpg", "jpeg", "webp", "bmp", "tiff") or content_type.startswith("image/"):
            florence_desc: Optional[str] = None
            ocr_text: Optional[str] = None

            # Run ImageWorker for Florence description
            try:
                img_res = await self.container.image_worker.run(
                    {"image_bytes_b64": b64, "file_name": filename, "file_size_bytes": len(file_bytes)},
                    job_id=f"img-{file_id[:8]}",
                )
                if img_res.succeeded and img_res.output:
                    analysis = img_res.output.get("analysis")
                    if analysis:
                        florence_desc = analysis.get("description")
            except Exception as exc:
                logger.warning("[orchestrator] ImageWorker failed", extra={"filename": filename, "error": str(exc)})

            # Run OCRWorker for text extraction
            try:
                ocr_res = await self.container.ocr_worker.run(
                    {"image_bytes_b64": b64, "file_name": filename, "evidence_id": file_id},
                    job_id=f"ocr-{file_id[:8]}",
                )
                if ocr_res.succeeded and ocr_res.output:
                    res_data = ocr_res.output.get("ocr_result", {})
                    ocr_text = res_data.get("translated_text") or res_data.get("raw_text")
            except Exception as exc:
                logger.warning("[orchestrator] OCRWorker failed", extra={"filename": filename, "error": str(exc)})

            return EvidenceItem(
                id=file_id,
                filename=filename,
                type="image",
                florence_description=florence_desc,
                ocr_text=ocr_text,
                metadata={"size_bytes": len(file_bytes)},
            )

        # ── Audio ────────────────────────────────────────────────────────────
        elif ext in ("mp3", "wav", "m4a", "ogg", "flac") or content_type.startswith("audio/"):
            transcript: Optional[str] = None
            try:
                audio_res = await self.container.audio_worker.run(
                    {"audio_bytes_b64": b64, "file_name": filename},
                    job_id=f"aud-{file_id[:8]}",
                )
                if audio_res.succeeded and audio_res.output:
                    transcript = audio_res.output.get("transcript")
            except Exception as exc:
                logger.warning("[orchestrator] AudioWorker failed", extra={"filename": filename, "error": str(exc)})

            if not transcript:
                try:
                    transcript = file_bytes.decode("utf-8", errors="ignore")
                except Exception:
                    pass

            return EvidenceItem(
                id=file_id,
                filename=filename,
                type="audio",
                transcript=transcript,
                metadata={"size_bytes": len(file_bytes)},
            )

        # ── Video ────────────────────────────────────────────────────────────
        elif ext in ("mp4", "avi", "mov", "mkv", "webm") or content_type.startswith("video/"):
            florence_desc: Optional[str] = None
            transcript: Optional[str] = None
            try:
                vid_res = await self.container.video_worker.run(
                    {"video_bytes_b64": b64, "file_name": filename},
                    job_id=f"vid-{file_id[:8]}",
                )
                if vid_res.succeeded and vid_res.output:
                    scenes = vid_res.output.get("scenes", [])
                    descriptions = [s.get("description") for s in scenes if s.get("description")]
                    if descriptions:
                        florence_desc = " ".join(descriptions)
                    transcript = vid_res.output.get("audio_transcript")
            except Exception as exc:
                logger.warning("[orchestrator] VideoWorker failed", extra={"filename": filename, "error": str(exc)})

            return EvidenceItem(
                id=file_id,
                filename=filename,
                type="video",
                florence_description=florence_desc,
                transcript=transcript,
                metadata={"size_bytes": len(file_bytes)},
            )

        # ── PDF ──────────────────────────────────────────────────────────────
        elif ext == "pdf" or content_type == "application/pdf":
            pdf_text: Optional[str] = None
            ocr_text: Optional[str] = None
            try:
                pdf_res = await self.container.pdf_worker.run(
                    {"pdf_bytes_b64": b64, "file_name": filename},
                    job_id=f"pdf-{file_id[:8]}",
                )
                if pdf_res.succeeded and pdf_res.output:
                    pdf_text = pdf_res.output.get("extracted_text")
                    ocr_text = pdf_res.output.get("ocr_text")
            except Exception as exc:
                logger.warning("[orchestrator] PDFWorker failed", extra={"filename": filename, "error": str(exc)})

            if not pdf_text and not ocr_text:
                try:
                    pdf_text = file_bytes.decode("utf-8", errors="ignore")
                except Exception:
                    pass

            return EvidenceItem(
                id=file_id,
                filename=filename,
                type="pdf",
                pdf_text=pdf_text,
                ocr_text=ocr_text,
                metadata={"size_bytes": len(file_bytes)},
            )

        # ── Generic Document / Text File ──────────────────────────────────────
        else:
            text_content: Optional[str] = None
            try:
                text_content = file_bytes.decode("utf-8", errors="ignore")
            except Exception:
                pass

            return EvidenceItem(
                id=file_id,
                filename=filename,
                type="document",
                pdf_text=text_content,
                metadata={"size_bytes": len(file_bytes)},
            )
