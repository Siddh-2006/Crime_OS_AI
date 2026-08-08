"""
MongoDB Atlas Complaint Pipeline Runner.

1. Connects to MongoDB Atlas cluster (database: 'test').
2. Fetches real live complaints from Atlas 'complaints' collection.
3. Fetches associated evidence items from Atlas 'evidences' collection.
4. Constructs CaseContext and executes the Single-Pass LLM Case Understanding Engine.
5. Saves the resulting CaseUnderstanding JSON back to MongoDB Atlas 'cases' collection.
6. Retrieves and displays the verified CaseUnderstanding output from Atlas.
"""
import asyncio
import io
import json
import sys
from pathlib import Path
from typing import Optional, Dict, Any, List

# Force UTF-8 output on Windows terminal
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

from motor.motor_asyncio import AsyncIOMotorClient
from app.case_understanding.engine import CaseUnderstandingEngine
from app.case_understanding.pipeline_orchestrator import CasePipelineOrchestrator
from app.case_understanding.repository import MongoCaseRepository
from app.core.config import settings
from app.core.container import get_container
from app.core.florence_autostart import ensure_florence_running
from app.core.logging import logger
from app.llm.client import ILLMClient, OllamaLLMClient
from app.schemas.case_context import CaseContext, EvidenceItem
from app.schemas.case_understanding import CaseUnderstanding





def is_fallback_description(desc: Optional[str]) -> bool:
    if not desc or not desc.strip():
        return True
    d = desc.strip().lower()
    fallback_prefixes = (
        "processed image evidence",
        "processed evidence",
        "processed document",
        "evidence document",
        "processed video",
        "processed audio",
        "processed image",
        "evidence screenshot",
    )
    for prefix in fallback_prefixes:
        if d.startswith(prefix):
            if "extracted ocr text:" in d:
                return False
            if len(d) < len(prefix) + 60:
                return True
    return False


async def main():
    print(f"\n{'='*75}")
    print(f"  FETCH REAL COMPLAINT FROM MONGODB ATLAS & RUN CASE UNDERSTANDING PIPELINE")
    print(f"{'='*75}\n")

    print(f"  Connecting to MongoDB Atlas...")
    print(f"  URI : {settings.MONGODB_URI[:45]}...")
    print(f"  DB  : {settings.MONGODB_DB}\n")

    from app.core.mongo import get_mongo_db
    db = await get_mongo_db()
    if db is None:
        print("  [Error] MongoDB Atlas connection failed.")
        sys.exit(1)
    print("  ✓ Connected to MongoDB Atlas cluster successfully!\n")

    # Auto-start Florence-2 captioning service if not already running
    await ensure_florence_running(florence_base_url=settings.FLORENCE_BASE_URL)

    import re
    from bson import ObjectId

    raw_target = sys.argv[1] if len(sys.argv) > 1 else "latest"
    TARGET_ID = str(raw_target).strip().strip('"').strip("'")

    from typing import Any

    target_complaint = None
    if TARGET_ID.lower() == "latest":
        target_complaint = await db.complaints.find_one({}, sort=[("createdAt", -1)])
    else:
        or_conditions: list[dict[str, Any]] = [
            {"complaintNumber": TARGET_ID},
            {"complaintNumber": {"$regex": f"^{re.escape(TARGET_ID)}$", "$options": "i"}},
            {"_id": TARGET_ID},
        ]
        if ObjectId.is_valid(TARGET_ID):
            or_conditions.append({"_id": ObjectId(TARGET_ID)})

        for attempt in range(20):
            target_complaint = await db.complaints.find_one({"$or": or_conditions})
            if target_complaint:
                break
            if attempt < 19:
                await asyncio.sleep(1.0)

    if not target_complaint:
        print(f"  [Error] Complaint [{TARGET_ID}] not found in Atlas database after retries.")
        sys.exit(1)

    case_id = str(target_complaint.get("_id"))
    complaint_num = target_complaint.get("complaintNumber") or case_id
    short_desc = target_complaint.get("shortDescription", "N/A")
    detailed_desc = target_complaint.get("detailedDescription", short_desc)
    category = target_complaint.get("category", "CYBERCRIME")

    print(f"  [Atlas Complaint Fetched]")
    print(f"  Mongo ID        : {case_id}")
    print(f"  Complaint No.   : {complaint_num}")
    print(f"  Category        : {category}")
    print(f"  Short Summary   : {short_desc}")
    print(f"  Detailed Length : {len(detailed_desc)} chars")

    # Gather embedded evidence items from complaint doc's 'evidence' array (Cloudinary URLs)
    raw_evidence = target_complaint.get("evidence", [])
    if not isinstance(raw_evidence, list):
        raw_evidence = []

    evidence_items = []
    import httpx
    from app.ocr_worker.engine import PaddleOCREngine
    ocr_engine = PaddleOCREngine()

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as http_client:
        for i, ev in enumerate(raw_evidence):
            if not isinstance(ev, dict):
                continue
            ev_id = str(ev.get("publicId") or ev.get("_id") or f"ev-{i+1}")
            fname = str(ev.get("originalFilename") or ev.get("filename") or f"evidence_{i+1}")
            rtype = str(ev.get("resourceType") or ev.get("type") or "image").lower()
            cloudinary_url = str(ev.get("secureUrl") or ev.get("url") or ev.get("cloudinaryUrl") or "")
            ai_meta = ev.get("aiMetadata") or {}
            short_cap = ai_meta.get("caption") or ""
            ocr_txt = ai_meta.get("ocrText") or ev.get("ocrText")
            florence_desc = ai_meta.get("aiSummary") or ai_meta.get("caption") or ai_meta.get("m4Caption") or ev.get("aiSummary") or ev.get("description")
            transcript = ai_meta.get("speechTranscript") or ai_meta.get("audioTranscript") or ev.get("transcript")
            pdf_txt = ai_meta.get("pdfText") or ev.get("pdfText")
            p_status = str(ev.get("processingStatus") or ai_meta.get("processingStatus") or "").upper()

            has_real_caption = bool(florence_desc and not is_fallback_description(florence_desc))
            has_real_ocr = bool(ocr_txt and ocr_txt.strip())
            has_real_transcript = bool(transcript and transcript.strip())
            has_real_pdf = bool(pdf_txt and pdf_txt.strip())

            is_already_processed = ("--force" not in sys.argv) and (has_real_ocr or has_real_caption or has_real_transcript or has_real_pdf)

            print(f"\n  [Evidence {i+1}/{len(raw_evidence)}] Inspecting '{fname}' (Type: {rtype})...")

            if is_already_processed:
                print(f"     ⚡ [CACHED] Florence/OCR metadata already present in MongoDB. Skipping re-analysis.")

            # 1. Florence-2 Visual Captioning (if missing) — fetch both <CAPTION> and <MORE_DETAILED_CAPTION>
            if not is_already_processed and not florence_desc and cloudinary_url and rtype in ("image", "png", "jpeg", "jpg"):
                print(f"     📷 [FLORENCE] Calling Florence-2 vision model ({settings.FLORENCE_BASE_URL})...")
                try:
                    img_res = await http_client.get(cloudinary_url)
                    if img_res.status_code == 200:
                        import base64 as _b64
                        img_b64 = _b64.b64encode(img_res.content).decode("utf-8")
                        
                        # Fetch short caption (<CAPTION>)
                        res_short = await http_client.post(
                            f"{settings.FLORENCE_BASE_URL}/predict",
                            json={"image_base64": img_b64, "task": "<CAPTION>"},
                            timeout=30.0
                        )
                        short_cap = res_short.json().get("result", "") if res_short.status_code == 200 else ""

                        # Fetch detailed caption (<MORE_DETAILED_CAPTION>)
                        res_detailed = await http_client.post(
                            f"{settings.FLORENCE_BASE_URL}/predict",
                            json={"image_base64": img_b64, "task": "<MORE_DETAILED_CAPTION>"},
                            timeout=30.0
                        )
                        detailed_cap = res_detailed.json().get("result", "") if res_detailed.status_code == 200 else ""

                        if detailed_cap or short_cap:
                            florence_desc = detailed_cap or short_cap
                            print(f"     ✓ Florence-2 visual captions generated for {fname}:")
                            if short_cap:
                                print(f"        • Short Caption: {short_cap}")
                            if detailed_cap:
                                print(f"        • Detail Summary: {detailed_cap[:120]}...")

                            ai_meta["caption"] = short_cap or detailed_cap
                            ai_meta["aiSummary"] = detailed_cap or short_cap
                    else:
                        logger.warning("[Florence] Could not download image for captioning: %s (status %s)", fname, img_res.status_code)
                except Exception as exc:
                    logger.warning(
                        "[SERVICE UNREACHABLE] Florence-2 microservice (%s) is NOT running or failed: %s",
                        settings.FLORENCE_BASE_URL,
                        exc
                    )
                    print(f"     ⚠️ [SERVICE UNREACHABLE] Florence-2 vision service ({settings.FLORENCE_BASE_URL}) is NOT running!")

            # 2. PaddleOCR Text Extraction (if missing)
            if not is_already_processed and not ocr_txt and cloudinary_url and rtype in ("image", "png", "jpeg", "jpg"):
                print(f"     🔤 [OCR] Downloading & running PaddleOCR for {fname}...")
                try:
                    res = await http_client.get(cloudinary_url)
                    if res.status_code == 200:
                        ocr_res = await ocr_engine.run(res.content)
                        if ocr_res.raw_text and ocr_res.raw_text.strip():
                            ocr_txt = ocr_res.raw_text.strip()
                            print(f"     ✓ Extracted {len(ocr_txt)} chars of text via PaddleOCR!")
                            if not florence_desc:
                                florence_desc = f"Evidence screenshot '{fname}'. Extracted OCR Text: {ocr_txt[:300]}"
                        else:
                            logger.info("[OCR SERVICE] PaddleOCR completed with 0 text detected for '%s'", fname)
                    else:
                        logger.error("[DOWNLOAD ERROR] Cloudinary returned status %s for '%s'", res.status_code, fname)
                        print(f"     ❌ [DOWNLOAD ERROR] Cloudinary status {res.status_code} for {fname}")
                except Exception as exc:
                    logger.error("[OCR SERVICE ERROR] PaddleOCR extraction failed for '%s': %s", fname, exc)
                    print(f"     ❌ [OCR SERVICE ERROR] Could not process {fname}: {exc}")

            # Store extracted OCR and Florence captions back into ev['aiMetadata'] for persistence
            if "aiMetadata" not in ev or not isinstance(ev["aiMetadata"], dict):
                ev["aiMetadata"] = {}
            if florence_desc:
                ev["aiMetadata"]["caption"] = short_cap or florence_desc
                ev["aiMetadata"]["aiSummary"] = florence_desc
            if ocr_txt:
                ev["aiMetadata"]["ocrText"] = ocr_txt
            if transcript:
                ev["aiMetadata"]["speechTranscript"] = transcript
            if pdf_txt:
                ev["aiMetadata"]["pdfText"] = pdf_txt

            metadata = {
                "url": cloudinary_url,
                "public_id": str(ev.get("publicId") or ""),
                "mime_type": str(ev.get("mimeType") or "")
            }

            evidence_items.append(
                EvidenceItem(
                    id=ev_id,
                    filename=fname,
                    type=rtype if rtype in ("image", "audio", "video", "pdf", "document") else "image",
                    florence_description=florence_desc or f"Evidence document '{fname}'",
                    ocr_text=ocr_txt,
                    transcript=transcript,
                    pdf_text=pdf_txt,
                    metadata=metadata,
                )
            )
    # ── Incremental Pipeline Execution ──────────────────────────────────────────
    container = get_container()
    orchestrator = container.incremental_pipeline_orchestrator

    valid_evidences = [ev for ev in raw_evidence if isinstance(ev, dict)]
    has_evidence = len(valid_evidences) > 0

    # 1. Register Complaint Profile (Instant <10ms creation, defers LLM call if evidence items exist)
    print("  [1/2] Registering ComplaintProfile...")
    complaint_profile, initial_case_understanding, upload_token = await orchestrator.register_complaint(
        case_id=case_id,
        complaint_text=detailed_desc,
        complaint_number=complaint_num,
        metadata={"category": category, "short_summary": short_desc},
        skip_llm=has_evidence,
    )
    print(f"  ✓ Saved ComplaintProfile for Case ID: {case_id}")

    # 2. Process Evidence Items Incrementally
    print("\n  [2/2] Processing Evidence Profiles Incrementally...")
    from app.schemas.case_profile import EvidenceProfile
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as http_client:
        for i, ev in enumerate(valid_evidences):
            ev_id = str(ev.get("publicId") or ev.get("_id") or f"ev-{i+1}")
            fname = str(ev.get("originalFilename") or ev.get("filename") or f"evidence_{i+1}")
            rtype = str(ev.get("resourceType") or ev.get("type") or "image").lower()
            cloudinary_url = str(ev.get("secureUrl") or ev.get("url") or ev.get("cloudinaryUrl") or "")
            ai_meta = ev.get("aiMetadata") or {}

            ocr_txt = ai_meta.get("ocrText") or ev.get("ocrText")
            florence_desc = ai_meta.get("m4Caption") or ai_meta.get("aiSummary") or ev.get("aiSummary") or ev.get("description")
            transcript = ai_meta.get("speechTranscript") or ai_meta.get("audioTranscript") or ev.get("transcript")
            pdf_txt = ai_meta.get("pdfText") or ev.get("pdfText")
            p_status = str(ev.get("processingStatus") or ai_meta.get("processingStatus") or "").upper()

            is_already_processed = ("--force" not in sys.argv) and (p_status == "PROCESSED" or bool(ocr_txt or florence_desc or transcript or pdf_txt))

            # Lookup existing EvidenceProfile in repository
            existing_ev_profile = await orchestrator.evidence_profile_repo.get_by_evidence_id(ev_id)
            if not existing_ev_profile:
                all_profiles = await orchestrator.evidence_profile_repo.get_all_for_case(case_id)
                for p in all_profiles:
                    if p.filename == fname or p.evidence_id == ev_id:
                        existing_ev_profile = p
                        break

            if existing_ev_profile:
                # Update existing profile if missing OCR/Florence data
                updated = False
                if ocr_txt and not existing_ev_profile.ocr_text:
                    existing_ev_profile.ocr_text = ocr_txt
                    updated = True
                if florence_desc and (not existing_ev_profile.florence_description or existing_ev_profile.florence_description.startswith("Processed ")):
                    existing_ev_profile.florence_description = florence_desc
                    updated = True
                if transcript and not existing_ev_profile.transcript:
                    existing_ev_profile.transcript = transcript
                    updated = True
                if pdf_txt and not existing_ev_profile.pdf_text:
                    existing_ev_profile.pdf_text = pdf_txt
                    updated = True
                if updated:
                    existing_ev_profile.processing_status = "PROCESSED"
                    await orchestrator.evidence_profile_repo.save(existing_ev_profile)
            else:
                existing_ev_profile = EvidenceProfile(
                    evidence_id=ev_id,
                    case_id=case_id,
                    filename=fname,
                    media_type=rtype if rtype in ("image", "audio", "video", "pdf", "document") else "image",
                    url=cloudinary_url,
                    processing_status="PROCESSED" if is_already_processed else "PENDING",
                    florence_description=florence_desc or f"Processed evidence '{fname}'",
                    ocr_text=ocr_txt,
                    transcript=transcript,
                    pdf_text=pdf_txt,
                    ai_metadata=ai_meta,
                )
                await orchestrator.evidence_profile_repo.save(existing_ev_profile)

            file_bytes = b""
            # Only download from Cloudinary if media workers actually need to run
            if not is_already_processed and not existing_ev_profile and cloudinary_url:
                try:
                    res = await http_client.get(cloudinary_url)
                    if res.status_code == 200:
                        file_bytes = res.content
                except Exception as exc:
                    logger.warning("[run_pipeline] Could not download file '%s': %s", fname, exc)

            if not file_bytes:
                file_bytes = fname.encode("utf-8")

            # Trigger LLM ONLY ONCE on the final evidence item of the batch
            is_last_item = (i == len(valid_evidences) - 1)
            force_run = ("--force" in sys.argv)
            ev_profile, case_understanding = await orchestrator.process_incremental_evidence(
                case_id=case_id,
                filename=fname,
                content_type=f"image/{rtype}" if rtype in ("png", "jpeg", "jpg") else rtype,
                file_bytes=file_bytes,
                evidence_id=ev_id,
                trigger_llm=is_last_item,
                force_reprocess=force_run,
            )
            print(f"  ✓ EvidenceProfile processed: '{fname}' (ID: {ev_id}, Type: {ev_profile.media_type})")

            # Extract metadata fields from current evidence item
            ai_meta = ev.get("aiMetadata") or {}
            ocr_txt = ai_meta.get("ocrText") or ev.get("ocrText")
            florence_desc = ai_meta.get("m4Caption") or ai_meta.get("aiSummary") or ev.get("aiSummary") or ev.get("description")
            transcript = ai_meta.get("speechTranscript") or ai_meta.get("audioTranscript") or ev.get("transcript")
            pdf_txt = ai_meta.get("pdfText") or ev.get("pdfText")

            # Build non-destructive $set patch with dot notation for aiMetadata fields
            raw_summary = ev_profile.florence_description
            if not raw_summary or raw_summary.startswith("Processed "):
                raw_summary = florence_desc
            final_summary = raw_summary or f"Processed {rtype} evidence '{fname}'"
            final_ocr = ev_profile.ocr_text or ocr_txt
            final_transcript = ev_profile.transcript or transcript
            final_pdf = ev_profile.pdf_text or pdf_txt

            patch = {
                "processingStatus": "PROCESSED",
                "aiMetadata.aiSummary": final_summary,
                "aiMetadata.ocrText": final_ocr,
                "aiMetadata.speechTranscript": final_transcript,
                "aiMetadata.pdfText": final_pdf,
                "aiMetadata.classification": getattr(ev_profile, "scene_type", None) or ("DOCUMENT" if final_ocr else "IMAGE"),
                "aiMetadata.classificationConfidence": 0.95,
            }
            # Strip out None and blank string values
            patch = {k: v for k, v in patch.items() if v is not None and (not isinstance(v, str) or v.strip() != "")}

            # Build item-specific search conditions to update ONLY this evidence file
            ev_conditions: list[dict[str, Any]] = [
                {"_id": ev_id},
                {"evidence_id": ev_id},
                {"evidence_id": f"crime-os/evidence/{case_id}/{ev_id}"},
                {"storage_ref": cloudinary_url},
                {"originalFilename": fname},
            ]
            if ObjectId.is_valid(ev_id):
                ev_conditions.append({"_id": ObjectId(ev_id)})

            await db.evidences.update_many(
                {"$or": ev_conditions},
                {"$set": patch}
            )

            # Update ONLY processingStatus on embedded complaint evidence item
            await db.complaints.update_one(
                {"_id": target_complaint["_id"], "evidence.originalFilename": fname},
                {"$set": {"evidence.$.processingStatus": "PROCESSED"}}
            )

    # Fetch living CaseIntelligence from Atlas 'complaints' collection
    case_understanding = await container.case_repository.get_by_id(case_id)
    if not case_understanding:
        # Fallback to direct analyze if initial run
        all_evs = await container.evidence_profile_repository.get_all_for_case(case_id)
        ctx = CaseContext.build_direct(case_id=case_id, complaint_text=detailed_desc, evidence_profiles=all_evs, metadata={"category": category, "short_summary": short_desc})
        case_understanding = await container.case_understanding_engine.analyze(ctx)
        await container.case_repository.save(case_understanding)

    # Update complaint document status in Atlas to PROCESSED
    await db.complaints.update_one(
        {"_id": target_complaint["_id"]},
        {"$set": {"processingStatus": "PROCESSED", "complaintIntelligence": case_understanding.model_dump()}}
    )

    # Retrieve directly from Atlas 'complaints' collection to verify persistence
    atlas_saved_doc = await db.complaints.find_one({"_id": target_complaint["_id"]})
    if atlas_saved_doc and atlas_saved_doc.get("complaintIntelligence"):
        print(f"  ✓ Verified CaseUnderstanding saved successfully to MongoDB Atlas collection 'complaints'!")
        print(f"  ✓ Saved Case ID: {target_complaint.get('_id')}\n")

    # Display Output (5 Core Sections)
    print(f"  [1] CASE UNDERSTANDING")
    cu = case_understanding.case_understanding
    print(f"      Exec Summary: {cu.executive_summary or cu.complaint_summary}")
    print(f"      Incident Brief: {cu.incident_brief or cu.incident_overview}")
    print(f"      Category  : {cu.crime_category} / {cu.crime_subtype}")
    print(f"      Priority  : {cu.priority.upper()} (Confidence: {cu.confidence:.0%})")

    print(f"\n  [2] TIMELINE ({len(case_understanding.timeline)} events)")
    for ev in case_understanding.timeline:
        refs = f" (Evidence: {', '.join(ev.supporting_evidence_ids)})" if ev.supporting_evidence_ids else ""
        print(f"      • [{ev.timestamp}] {ev.description}{refs}")

    print(f"\n  [3] EVIDENCE INTELLIGENCE ({len(case_understanding.evidence_intelligence)} items)")
    for ei in case_understanding.evidence_intelligence:
        print(f"      • [{ei.importance.upper()}] {ei.caption or ei.filename}")
        print(f"        Summary : {ei.summary}")
        if ei.supports:
            print(f"        Supports: {', '.join(ei.supports)}")

    print(f"\n  [4] MISSING INFORMATION & EVIDENCE ({len(case_understanding.missing_information_and_evidence)} items)")
    for mie in case_understanding.missing_information_and_evidence:
        print(f"      • [{mie.importance.upper()}] {mie.title} -- {mie.description}")

    print(f"\n  [5] CONTRADICTIONS ({len(case_understanding.contradictions)})")
    if not case_understanding.contradictions:
        print(f"      None detected across complaint and evidence.")
    else:
        for c in case_understanding.contradictions:
            ids = f" (Involved Evidence: {', '.join(c.related_evidence_ids)})" if c.related_evidence_ids else ""
            print(f"      • {c.description}{ids}")

    print(f"\n{'='*75}")
    print(f"  [OK] FETCH FROM MONGODB ATLAS & SINGLE PIPELINE EXECUTION SUCCESSFUL")
    print(f"{'='*75}\n")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        print(f"\n  [FATAL ERROR] Pipeline execution failed: {exc}", file=sys.stderr)
        sys.exit(1)
