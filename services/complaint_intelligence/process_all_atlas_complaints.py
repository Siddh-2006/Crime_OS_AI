"""
Batch process ALL complaints in MongoDB Atlas using CaseUnderstandingEngine.
Converts every complaint in the MongoDB Atlas database into a 9-section CaseUnderstanding document
and saves it to the 'cases' collection.
"""
import asyncio
import io
import logging
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Force UTF-8 output on Windows terminal
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

from motor.motor_asyncio import AsyncIOMotorClient
from app.case_understanding.engine import CaseUnderstandingEngine
from app.core.config import settings
from app.core.container import get_container
from app.core.florence_autostart import ensure_florence_running
from app.llm.client import OllamaLLMClient
from app.schemas.case_context import EvidenceItem
from app.schemas.case_understanding import CaseUnderstanding


async def save_to_db(db, case: CaseUnderstanding) -> str:
    """Save directly to the shared db connection — no secondary Motor client."""
    data = case.model_dump()
    data["_id"] = case.case_id
    await db["cases"].replace_one({"_id": case.case_id}, data, upsert=True)
    return case.case_id


import httpx
from app.ocr_worker.engine import PaddleOCREngine

_ocr_engine = None

def get_ocr_engine():
    global _ocr_engine
    if _ocr_engine is None:
        _ocr_engine = PaddleOCREngine()
    return _ocr_engine


async def process_complaint(db, comp, engine, container):
    case_id = str(comp.get("_id"))
    complaint_num = comp.get("complaintNumber") or case_id
    short_desc = comp.get("shortDescription") or "N/A"
    detailed_desc = comp.get("detailedDescription") or short_desc
    category = comp.get("category") or "GENERAL_CYBERCRIME"

    print(f"\n{'='*70}")
    print(f" Processing Complaint: {complaint_num} (_id: {case_id})")
    print(f" Category           : {category}")
    print(f" Short Description  : {short_desc[:80]}")
    print(f"{'='*70}")

    # 1. Gather embedded evidence items exclusively from complaint doc's 'evidence' array (Cloudinary URLs)
    raw_evidence = comp.get("evidence", [])
    if not isinstance(raw_evidence, list):
        raw_evidence = []

    evidence_items = []

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
                            json={"image_base64": img_b64, "task": "<MORE_DETAILED_CAPTION>"},
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
                print(f"  [OCR] Downloading & running PaddleOCR for: {fname}...")
                try:
                    res = await http_client.get(cloudinary_url)
                    if res.status_code == 200:
                        ocr_res = await get_ocr_engine().run(res.content)
                        if ocr_res.raw_text and ocr_res.raw_text.strip():
                            ocr_txt = ocr_res.raw_text.strip()
                            print(f"  ✓ Extracted {len(ocr_txt)} chars of text via PaddleOCR!")
                            if not florence_desc:
                                florence_desc = f"Evidence image '{fname}'. Extracted OCR Text: {ocr_txt[:300]}"
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

    print(f" Total Attached Evidences: {len(evidence_items)}")

    # 3. Build CaseContext
    context = container.case_context_builder.build(
        complaint_text=detailed_desc,
        evidence_items=evidence_items,
        case_id=case_id,
        complaint_metadata={"complaint_number": complaint_num, "category": category},
    )

    # 4. Analyze via CaseUnderstandingEngine
    print(" Running CaseUnderstandingEngine (Ollama gemma4:e2b)...")
    case_understanding = await engine.analyze(context)

    # 5. Persist directly via the shared db connection
    await save_to_db(db, case_understanding)
    print(f" ✓ Saved to Atlas 'cases' collection! (Priority: {case_understanding.overview.priority.upper()})")


async def main():
    print("\n=========================================================================")
    print("  BATCH PROCESSING ALL COMPLAINTS IN MONGODB ATLAS -> 'cases'")
    print("=========================================================================\n")

    print("Connecting to MongoDB Atlas...")
    client = AsyncIOMotorClient(settings.MONGODB_URL, serverSelectionTimeoutMS=30000)
    await client.admin.command("ping")
    print("✓ Connected to MongoDB Atlas!\n")

    # Auto-start Florence-2 captioning service if not already running
    await ensure_florence_running(florence_base_url=settings.FLORENCE_BASE_URL)

    db = client[settings.MONGODB_DB_NAME]

    complaints = await db.complaints.find({}).to_list(length=100)
    print(f"Found {len(complaints)} total complaints in database.\n")

    force_reprocess = "--force" in sys.argv
    # Skip already-processed complaints unless --force is specified
    existing_ids = set()
    if not force_reprocess:
        existing_docs = await db.cases.find({}, {"_id": 1}).to_list(length=200)
        for d in existing_docs:
            existing_ids.add(str(d["_id"]))
        print(f"Already processed: {len(existing_ids)} complaint(s). Skipping those.\n")
    else:
        print("⚡ --force flag detected! Re-processing ALL complaints.\n")

    container = get_container()
    llm_client = OllamaLLMClient(
        base_url=settings.OLLAMA_BASE_URL,
        model=settings.OLLAMA_MODEL,
        timeout=settings.OLLAMA_TIMEOUT_SECONDS,
    )
    engine = CaseUnderstandingEngine(llm_client=llm_client)

    processed = 0
    skipped = 0
    errors = 0
    for i, comp in enumerate(complaints, 1):
        comp_id = str(comp.get("_id"))
        print(f"\n--- [Complaint {i}/{len(complaints)}] ---")
        if comp_id in existing_ids:
            print(f" ⏭  Already processed, skipping: {comp_id}")
            skipped += 1
            continue
        try:
            await process_complaint(db, comp, engine, container)
            processed += 1
        except Exception as exc:
            print(f"  [ERROR] Failed: {comp_id}: {exc}")
            errors += 1

    print("\n=========================================================================")
    print(f"  ✓ DONE! Processed: {processed} | Skipped: {skipped} | Errors: {errors}")
    print("=========================================================================\n")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
