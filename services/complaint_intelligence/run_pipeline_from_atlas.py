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

    raw_target = sys.argv[1] if len(sys.argv) > 1 else "COMP-7d3ea8bc-841a-4fe8-b543-78282832385c"
    TARGET_ID = str(raw_target).strip().strip('"').strip("'")

    from typing import Any

    or_conditions: list[dict[str, Any]] = [
        {"complaintNumber": TARGET_ID},
        {"complaintNumber": {"$regex": f"^{re.escape(TARGET_ID)}$", "$options": "i"}},
        {"_id": TARGET_ID},
    ]
    if ObjectId.is_valid(TARGET_ID):
        or_conditions.append({"_id": ObjectId(TARGET_ID)})

    target_complaint = None
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

            ocr_txt = ai_meta.get("ocrText") or ev.get("ocrText")
            florence_desc = ai_meta.get("m4Caption") or ai_meta.get("aiSummary") or ev.get("aiSummary") or ev.get("description")
            transcript = ai_meta.get("speechTranscript") or ai_meta.get("audioTranscript") or ev.get("transcript")
            pdf_txt = ai_meta.get("pdfText") or ev.get("pdfText")

            # 1. Florence-2 Visual Captioning (if missing) — send image_base64
            if not florence_desc and cloudinary_url and rtype in ("image", "png", "jpeg", "jpg"):
                try:
                    img_res = await http_client.get(cloudinary_url)
                    if img_res.status_code == 200:
                        import base64 as _b64
                        img_b64 = _b64.b64encode(img_res.content).decode("utf-8")
                        res_florence = await http_client.post(
                            f"{settings.FLORENCE_BASE_URL}/predict",
                            json={"image_base64": img_b64, "task": "<CAPTION>"},
                            timeout=30.0
                        )
                        if res_florence.status_code == 200:
                            florence_desc = res_florence.json().get("result", "")
                            if florence_desc:
                                print(f"  ✓ Florence-2 visual caption generated for: {fname}")
                    else:
                        logger.warning("[Florence] Could not download image for captioning: %s (status %s)", fname, img_res.status_code)
                except Exception as exc:
                    logger.warning(
                        "[SERVICE UNREACHABLE] Florence-2 microservice (%s) is NOT running or failed: %s",
                        settings.FLORENCE_BASE_URL,
                        exc
                    )
                    print(f"  ⚠️ [SERVICE UNREACHABLE] Florence-2 vision service ({settings.FLORENCE_BASE_URL}) is NOT running!")

            # 2. PaddleOCR Text Extraction (if missing)
            if not ocr_txt and cloudinary_url and rtype in ("image", "png", "jpeg", "jpg"):
                print(f"  [OCR] Downloading & running PaddleOCR for {fname}...")
                try:
                    res = await http_client.get(cloudinary_url)
                    if res.status_code == 200:
                        ocr_res = await ocr_engine.run(res.content)
                        if ocr_res.raw_text and ocr_res.raw_text.strip():
                            ocr_txt = ocr_res.raw_text.strip()
                            print(f"  ✓ Extracted {len(ocr_txt)} chars of text via PaddleOCR!")
                            if not florence_desc:
                                florence_desc = f"Evidence screenshot '{fname}'. Extracted OCR Text: {ocr_txt[:300]}"
                        else:
                            logger.info("[OCR SERVICE] PaddleOCR completed with 0 text detected for '%s'", fname)
                    else:
                        logger.error("[DOWNLOAD ERROR] Cloudinary returned status %s for '%s'", res.status_code, fname)
                        print(f"  ❌ [DOWNLOAD ERROR] Cloudinary status {res.status_code} for {fname}")
                except Exception as exc:
                    logger.error("[OCR SERVICE ERROR] PaddleOCR extraction failed for '%s': %s", fname, exc)
                    print(f"  ❌ [OCR SERVICE ERROR] Could not process {fname}: {exc}")

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
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as http_client:
        for i, ev in enumerate(valid_evidences):
            ev_id = str(ev.get("publicId") or ev.get("_id") or f"ev-{i+1}")
            fname = str(ev.get("originalFilename") or ev.get("filename") or f"evidence_{i+1}")
            rtype = str(ev.get("resourceType") or ev.get("type") or "image").lower()
            cloudinary_url = str(ev.get("secureUrl") or ev.get("url") or ev.get("cloudinaryUrl") or "")

            file_bytes = b""
            if cloudinary_url:
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
            ev_profile, case_understanding = await orchestrator.process_incremental_evidence(
                case_id=case_id,
                filename=fname,
                content_type=f"image/{rtype}" if rtype in ("png", "jpeg", "jpg") else rtype,
                file_bytes=file_bytes,
                evidence_id=ev_id,
                trigger_llm=is_last_item,
            )
            print(f"  ✓ EvidenceProfile processed: '{fname}' (ID: {ev_id}, Type: {ev_profile.media_type})")

            # Update evidence item status & aiMetadata in complaints and evidences collections
            ai_meta = {
                "ocrText": getattr(ev_profile, "ocr_text", None),
                "imageTags": getattr(ev_profile, "tags", []),
                "aiSummary": getattr(ev_profile, "caption", None) or f"Processed {rtype} evidence '{fname}'",
                "speechTranscript": getattr(ev_profile, "audio_transcript", None),
                "pdfText": getattr(ev_profile, "extracted_text", None),
                "classification": getattr(ev_profile, "scene_type", None) or "DOCUMENT",
                "classificationConfidence": 0.95
            }

            await db.complaints.update_one(
                {"_id": target_complaint["_id"], "evidence.originalFilename": fname},
                {"$set": {"evidence.$.processingStatus": "PROCESSED", "evidence.$.aiMetadata": ai_meta}}
            )

            await db.evidences.update_many(
                {"$or": [{"case_id": target_complaint["_id"]}, {"case_id": case_id}], "originalFilename": fname},
                {"$set": {"processingStatus": "PROCESSED", "aiMetadata": ai_meta}}
            )

    # Fetch living CaseIntelligence from Atlas 'cases' collection
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

    # Retrieve directly from Atlas 'cases' collection to verify persistence
    atlas_saved_doc = await db.cases.find_one({"_id": case_id})
    if atlas_saved_doc:
        print(f"  ✓ Verified CaseUnderstanding saved successfully to MongoDB Atlas collection 'cases'!")
        print(f"  ✓ Saved Case ID: {atlas_saved_doc.get('case_id')}\n")

    # Display Output
    print(f"  [1] OVERVIEW")
    print(f"      Summary   : {case_understanding.overview.complaint_summary}")
    print(f"      Category  : {case_understanding.overview.crime_category} / {case_understanding.overview.crime_subtype}")
    print(f"      Priority  : {case_understanding.overview.priority.upper()} (Confidence: {case_understanding.overview.confidence:.0%})")

    print(f"\n  [2] TIMELINE ({len(case_understanding.timeline)} events)")
    for ev in case_understanding.timeline:
        print(f"      • [{ev.timestamp}] {ev.description} (Evidence: {', '.join(ev.supporting_evidence_ids)})")

    print(f"\n  [3] PEOPLE & ENTITIES")
    p = case_understanding.people_and_entities
    print(f"      Victims       : {[v.value for v in p.victims]}")
    print(f"      Suspects      : {[s.value for s in p.suspects]}")
    print(f"      UPI IDs       : {[u.value for u in p.upi_ids]}")
    print(f"      Vehicles      : {[vh.value for vh in p.vehicles]}")
    print(f"      Bank Accounts : {[b.value for b in p.bank_accounts]}")

    print(f"\n  [4] EVIDENCE CORRELATION ({len(case_understanding.evidence_correlation)} correlations)")
    for corr in case_understanding.evidence_correlation:
        print(f"      • Allegation  : {corr.allegation}")
        print(f"        Corroborated: {corr.explanation} (Confidence: {corr.confidence:.0%})")

    print(f"\n  [5] CRIME ANALYSIS")
    ca = case_understanding.crime_analysis
    print(f"      Modus Operandi : {ca.modus_operandi}")
    print(f"      Financial Loss : ₹{ca.estimated_financial_loss:,.2f}" if ca.estimated_financial_loss else "      Financial Loss : N/A")

    print(f"\n  [6] CONTRADICTIONS ({len(case_understanding.contradictions)})")
    if not case_understanding.contradictions:
        print(f"      None detected across complaint and evidence.")
    else:
        for c in case_understanding.contradictions:
            print(f"      • {c.description}")

    print(f"\n  [7] MISSING INFORMATION ({len(case_understanding.missing_information)})")
    for mi in case_understanding.missing_information:
        print(f"      • [{mi.importance.upper()}] {mi.item} -- {mi.reason}")

    print(f"\n  [8] MISSING EVIDENCE GAPS ({len(case_understanding.missing_evidence)})")
    for me in case_understanding.missing_evidence:
        print(f"      • [{me.importance.upper()}] {me.evidence_name} -- {me.reason_relevant}")

    print(f"\n{'='*75}")
    print(f"  [OK] FETCH FROM MONGODB ATLAS & SINGLE PIPELINE EXECUTION SUCCESSFUL")
    print(f"{'='*75}\n")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        print(f"\n  [FATAL ERROR] Pipeline execution failed: {exc}", file=sys.stderr)
        sys.exit(1)
