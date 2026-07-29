"""
Incremental Pipeline Orchestrator — Decoupled Complaint & Evidence Processing.
Implements incremental processing architecture:
1. Complaint is registered ONCE -> ComplaintProfile (immutable).
2. Each Evidence item is processed ONCE by its worker -> EvidenceProfile (immutable, idempotent).
3. Adding new evidence ONLY processes that evidence, then rebuilds living CaseIntelligence from ComplaintProfile + ALL accumulated EvidenceProfiles.
4. On complaint registration, an UploadToken is automatically created — encapsulated in upload_token_repository.
"""
from __future__ import annotations

import asyncio
import base64
import uuid
from typing import Any, Dict, List, Optional, Tuple

from app.case_understanding.interfaces import ICaseContextBuilder, ICaseRepository, ICaseUnderstandingEngine
from app.case_understanding.profile_repository import IComplaintProfileRepository, IEvidenceProfileRepository
from app.core.config import settings
from app.core.container import Container
from app.core.logging import logger
from app.schemas.case_context import CaseContext, EvidenceItem
from app.schemas.case_profile import ComplaintProfile, EvidenceProfile
from app.schemas.case_understanding import CaseUnderstanding
from app.schemas.upload_token import TokenGenerateResponse


class IncrementalPipelineOrchestrator:
    """
    Orchestrates decoupled, incremental case intelligence:
    - `register_complaint`: Processes complaint text once, auto-generates upload token.
    - `process_incremental_evidence`: Processes single new evidence item once, then triggers living intelligence fusion.
    """

    def __init__(
        self,
        container: Container,
        complaint_profile_repo: Optional[IComplaintProfileRepository] = None,
        evidence_profile_repo: Optional[IEvidenceProfileRepository] = None,
        case_repo: Optional[ICaseRepository] = None,
        engine: Optional[ICaseUnderstandingEngine] = None,
    ) -> None:
        self.container = container
        self.complaint_profile_repo = complaint_profile_repo or container.complaint_profile_repository
        self.evidence_profile_repo = evidence_profile_repo or container.evidence_profile_repository
        self.case_repo = case_repo or container.case_repository
        self.engine = engine or container.case_understanding_engine

    # ── 1. COMPLAINT REGISTRATION (Runs Exactly Once per Complaint) ─────────────
    async def register_complaint(
        self,
        case_id: str,
        complaint_text: str,
        complaint_number: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        skip_llm: bool = False,
    ) -> Tuple[ComplaintProfile, Optional[CaseUnderstanding], Optional[TokenGenerateResponse]]:
        logger.info(
            "[incremental_orchestrator] Registering new complaint",
            extra={"case_id": case_id, "complaint_number": complaint_number},
        )

        # Check if ComplaintProfile already exists
        existing_profile = await self.complaint_profile_repo.get_by_case_id(case_id)
        if existing_profile:
            logger.info("[incremental_orchestrator] ComplaintProfile already exists", extra={"case_id": case_id})
            existing_case = await self.case_repo.get_by_id(case_id)
            if not existing_case and not skip_llm:
                existing_evidences = await self.evidence_profile_repo.get_all_for_case(case_id)
                context = CaseContext.from_profiles(existing_profile, existing_evidences)
                existing_case = await self.engine.analyze(context)
                await self.case_repo.save(existing_case)
            token_info = await self._get_or_create_upload_token(case_id, complaint_number)
            return existing_profile, existing_case, token_info

        meta = dict(metadata or {})
        translated_text: Optional[str] = None
        detected_lang = "en"

        # Step 1: Language Detection & Translation
        try:
            from app.ocr_worker.translator import DeepTranslator
            translator = DeepTranslator()
            detected_lang = await translator.detect_language(complaint_text)
            if detected_lang not in ("en", "unknown"):
                translated_text = await translator.translate(complaint_text, source_lang=detected_lang)
                logger.info(
                    "[incremental_orchestrator] Translated complaint text",
                    extra={"case_id": case_id, "source_lang": detected_lang},
                )
        except Exception as exc:
            logger.warning("[incremental_orchestrator] Language translation step failed", extra={"error": str(exc)})

        # Step 2: Create immutable ComplaintProfile (Takes < 10ms)
        complaint_profile = ComplaintProfile(
            case_id=case_id,
            complaint_number=complaint_number,
            original_text=complaint_text,
            translated_text=translated_text,
            detected_language=detected_lang,
            metadata=meta,
        )
        await self.complaint_profile_repo.save(complaint_profile)

        # Step 3: Auto-generate upload token (encapsulated in token service)
        token_info = await self._get_or_create_upload_token(case_id, complaint_number)

        # Step 4: Deferred LLM Execution
        case_understanding: Optional[CaseUnderstanding] = None
        if not skip_llm:
            existing_evidences = await self.evidence_profile_repo.get_all_for_case(case_id)
            context = CaseContext.from_profiles(complaint_profile, existing_evidences)
            case_understanding = await self.engine.analyze(context)
            await self.case_repo.save(case_understanding)

        return complaint_profile, case_understanding, token_info

    async def _get_or_create_upload_token(
        self,
        case_id: str,
        complaint_number: Optional[str],
    ) -> Optional[TokenGenerateResponse]:
        """Generate upload token + QR code. Fully encapsulated — orchestrator stays clean."""
        try:
            from app.case_understanding.qr_service import QRCodeService
            from app.core.config import settings

            token_repo = self.container.upload_token_repository
            base = settings.EVIDENCE_UPLOAD_BASE_URL.rstrip("/")
            template = f"{base}/evidence/upload/{{token}}"

            ut = await token_repo.get_or_create(
                case_id=case_id,
                complaint_number=complaint_number,
                upload_url_template=template,
            )
            qr_svc = QRCodeService()
            qr_b64 = qr_svc.generate_base64_png(ut.upload_url)
            return TokenGenerateResponse(
                token=ut.token,
                upload_url=ut.upload_url,
                qr_code_base64=qr_b64,
                case_id=ut.case_id,
                complaint_number=ut.complaint_number,
            )
        except Exception as exc:
            logger.warning(
                "[incremental_orchestrator] Upload token generation failed (non-fatal)",
                extra={"case_id": case_id, "error": str(exc)},
            )
            return None

    # ── 2. INCREMENTAL EVIDENCE PROCESSING ─────────────────────────────────────
    async def process_incremental_evidence(
        self,
        case_id: str,
        filename: str,
        content_type: str,
        file_bytes: bytes,
        evidence_id: Optional[str] = None,
        force_reprocess: bool = False,
        trigger_llm: bool = True,
    ) -> Tuple[EvidenceProfile, Optional[CaseUnderstanding]]:
        ev_id = evidence_id or str(uuid.uuid4())
        logger.info(
            "[incremental_orchestrator] Processing incremental evidence file",
            extra={"case_id": case_id, "evidence_id": ev_id, "file_name": filename},
        )

        # Check if EvidenceProfile already exists (Idempotency)
        existing_ev_profile = await self.evidence_profile_repo.get_by_evidence_id(ev_id)
        if existing_ev_profile and not force_reprocess:
            logger.info(
                "[incremental_orchestrator] Idempotency check: EvidenceProfile already processed. Skipping worker.",
                extra={"evidence_id": ev_id},
            )
            ev_profile = existing_ev_profile
        else:
            # Run worker ONLY on this single new evidence file
            ev_profile = await self._run_single_worker(case_id, ev_id, filename, content_type, file_bytes)
            await self.evidence_profile_repo.save(ev_profile)
            logger.info(
                "[incremental_orchestrator] Created new EvidenceProfile",
                extra={"evidence_id": ev_id, "media_type": ev_profile.media_type},
            )

        if not trigger_llm:
            print(f"  ✓ EvidenceProfile saved for '{filename}' (ID: {ev_id}, Type: {ev_profile.media_type}) [LLM Fusion deferred]")
            return ev_profile, None

        case_understanding = await self.fuse_case_intelligence(case_id)
        return ev_profile, case_understanding

    async def fuse_case_intelligence(self, case_id: str) -> CaseUnderstanding:
        """Fetch ComplaintProfile + ALL accumulated EvidenceProfiles and perform a SINGLE LLM fusion call."""
        complaint_profile = await self.complaint_profile_repo.get_by_case_id(case_id)
        if not complaint_profile:
            complaint_profile = ComplaintProfile(
                case_id=case_id,
                original_text="Complaint text pending registration.",
            )
            await self.complaint_profile_repo.save(complaint_profile)

        all_evidence_profiles = await self.evidence_profile_repo.get_all_for_case(case_id)

        print(f"\n  [PIPELINE STEP 3/3: LLM CASE FUSION]")
        print(f"     Case ID              : {case_id}")
        print(f"     Accumulated Evidences: {len(all_evidence_profiles)} item(s)")
        print(f"     LLM Model            : {getattr(settings, 'PRIMARY_LLM_PROVIDER', 'ollama').upper()} / {getattr(settings, 'OLLAMA_MODEL', getattr(settings, 'GEMINI_MODEL', 'gemma4:e4b'))}")
        print(f"     Status               : Running Single-Pass LLM Fusion Engine...")

        logger.info(
            "[incremental_orchestrator] Triggering living CaseIntelligence fusion",
            extra={"case_id": case_id, "total_accumulated_evidence": len(all_evidence_profiles)},
        )

        context = CaseContext.from_profiles(complaint_profile, all_evidence_profiles)
        case_understanding = await self.engine.analyze(context)
        await self.case_repo.save(case_understanding)

        print(f"  [DONE] [PIPELINE COMPLETE] CaseIntelligence updated & saved to MongoDB Atlas collection 'cases' for Case ID: '{case_id}'!")
        print(f"     Summary : {case_understanding.overview.complaint_summary[:100]}...")
        print(f"     Priority: {case_understanding.overview.priority.upper()} (Confidence: {case_understanding.overview.confidence:.0%})\n")

        return case_understanding

    # ── PRIVATE: Dispatch Single File to Worker ───────────────────────────────
    async def _run_single_worker(
        self,
        case_id: str,
        evidence_id: str,
        filename: str,
        content_type: str,
        file_bytes: bytes,
    ) -> EvidenceProfile:
        ext = filename.split(".")[-1].lower() if "." in filename else ""
        b64 = base64.b64encode(file_bytes).decode("utf-8")

        print(f"\n  [PIPELINE STEP 1/3: CLOUDINARY UPLOAD]")
        print(f"     File        : {filename}")
        print(f"     Target Path : crime-os/evidence/{case_id}/")

        # ── Cloudinary Upload ──────────────────────────────────────────────────
        cloudinary_url: Optional[str] = None
        try:
            cloudinary_url = await self.container.cloudinary_service.upload_file(
                file_bytes=file_bytes,
                filename=filename,
                media_type=content_type or ext,
                case_id=case_id,
            )
            if cloudinary_url:
                print(f"  ✓ Uploaded to Cloudinary: {cloudinary_url}")
        except Exception as exc:
            logger.warning(
                "[incremental_orchestrator] Cloudinary upload failed",
                extra={"file_name": filename, "error": str(exc)},
            )

        print(f"\n  [PIPELINE STEP 2/3: MEDIA PERCEPTION WORKER]")
        print(f"     File        : {filename}")
        print(f"     Media Type  : {ext.upper() or content_type}")
        print(f"     Processing  : Extracting features & descriptions...")

        # ── Image ─────────────────────────────────────────────────────────────
        if ext in ("png", "jpg", "jpeg", "webp", "bmp", "tiff") or content_type.startswith("image/"):
            florence_desc: Optional[str] = None
            ocr_text: Optional[str] = None

            try:
                img_res = await self.container.image_worker.run(
                    {"image_bytes_b64": b64, "file_name": filename, "file_size_bytes": len(file_bytes)},
                    job_id=f"img-{evidence_id[:8]}",
                )
                if img_res.succeeded and img_res.output:
                    analysis = img_res.output.get("analysis")
                    if analysis:
                        florence_desc = analysis.get("description")
            except Exception as exc:
                logger.warning("[incremental_orchestrator] ImageWorker failed", extra={"file_name": filename, "error": str(exc)})

            try:
                ocr_res = await self.container.ocr_worker.run(
                    {"image_bytes_b64": b64, "file_name": filename, "evidence_id": evidence_id},
                    job_id=f"ocr-{evidence_id[:8]}",
                )
                if ocr_res.succeeded and ocr_res.output:
                    res_data = ocr_res.output.get("ocr_result", {})
                    ocr_text = res_data.get("translated_text") or res_data.get("raw_text")
            except Exception as exc:
                logger.warning("[incremental_orchestrator] OCRWorker failed", extra={"file_name": filename, "error": str(exc)})

            return EvidenceProfile(
                evidence_id=evidence_id,
                case_id=case_id,
                filename=filename,
                media_type="image",
                url=cloudinary_url,
                florence_description=florence_desc,
                ocr_text=ocr_text,
                metadata={"size_bytes": len(file_bytes)},
            )

        # ── Audio ─────────────────────────────────────────────────────────────
        elif ext in ("mp3", "wav", "m4a", "ogg", "flac") or content_type.startswith("audio/"):
            transcript: Optional[str] = None
            try:
                audio_res = await self.container.audio_worker.run(
                    {"audio_bytes_b64": b64, "file_name": filename},
                    job_id=f"aud-{evidence_id[:8]}",
                )
                if audio_res.succeeded and audio_res.output:
                    transcript = audio_res.output.get("transcript")
            except Exception as exc:
                logger.warning("[incremental_orchestrator] AudioWorker failed", extra={"file_name": filename, "error": str(exc)})

            if not transcript:
                try:
                    transcript = file_bytes.decode("utf-8", errors="ignore")
                except Exception:
                    pass

            return EvidenceProfile(
                evidence_id=evidence_id,
                case_id=case_id,
                filename=filename,
                media_type="audio",
                url=cloudinary_url,
                transcript=transcript,
                metadata={"size_bytes": len(file_bytes)},
            )

        # ── Video ─────────────────────────────────────────────────────────────
        elif ext in ("mp4", "avi", "mov", "mkv", "webm") or content_type.startswith("video/"):
            florence_desc: Optional[str] = None
            transcript: Optional[str] = None
            try:
                vid_res = await self.container.video_worker.run(
                    {"video_bytes_b64": b64, "file_name": filename},
                    job_id=f"vid-{evidence_id[:8]}",
                )
                if vid_res.succeeded and vid_res.output:
                    scenes = vid_res.output.get("scenes", [])
                    descriptions = [s.get("description") for s in scenes if s.get("description")]
                    if descriptions:
                        florence_desc = " ".join(descriptions)
                    transcript = vid_res.output.get("audio_transcript")
            except Exception as exc:
                logger.warning("[incremental_orchestrator] VideoWorker failed", extra={"file_name": filename, "error": str(exc)})

            return EvidenceProfile(
                evidence_id=evidence_id,
                case_id=case_id,
                filename=filename,
                media_type="video",
                url=cloudinary_url,
                florence_description=florence_desc,
                transcript=transcript,
                metadata={"size_bytes": len(file_bytes)},
            )

        # ── PDF ───────────────────────────────────────────────────────────────
        elif ext == "pdf" or content_type == "application/pdf":
            pdf_text: Optional[str] = None
            ocr_text: Optional[str] = None
            try:
                pdf_res = await self.container.pdf_worker.run(
                    {"pdf_bytes_b64": b64, "file_name": filename},
                    job_id=f"pdf-{evidence_id[:8]}",
                )
                if pdf_res.succeeded and pdf_res.output:
                    pdf_text = pdf_res.output.get("extracted_text")
                    ocr_text = pdf_res.output.get("ocr_text")
            except Exception as exc:
                logger.warning("[incremental_orchestrator] PDFWorker failed", extra={"file_name": filename, "error": str(exc)})

            if not pdf_text and not ocr_text:
                try:
                    pdf_text = file_bytes.decode("utf-8", errors="ignore")
                except Exception:
                    pass

            return EvidenceProfile(
                evidence_id=evidence_id,
                case_id=case_id,
                filename=filename,
                media_type="pdf",
                url=cloudinary_url,
                pdf_text=pdf_text,
                ocr_text=ocr_text,
                metadata={"size_bytes": len(file_bytes)},
            )

        # ── Document / Other ──────────────────────────────────────────────────
        else:
            text_content: Optional[str] = None
            try:
                text_content = file_bytes.decode("utf-8", errors="ignore")
            except Exception:
                pass

            return EvidenceProfile(
                evidence_id=evidence_id,
                case_id=case_id,
                filename=filename,
                media_type="document",
                url=cloudinary_url,
                pdf_text=text_content,
                metadata={"size_bytes": len(file_bytes)},
            )
