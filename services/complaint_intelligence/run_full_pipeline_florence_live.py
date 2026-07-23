"""
Full End-to-End Pipeline: MongoDB Atlas → Real Evidence (Cloudinary) → Florence-2 → PaddleOCR → LLM.

Steps:
1. Connect to MongoDB Atlas ('test' database).
2. Fetch complaint COMP-88958b14-18a5-47b9-ab40-5fc1bc220581 including its evidence[].
3. Download each evidence image from Cloudinary secureUrl.
4. Run each image through LIVE Florence-2 microservice (port 8002) for detailed visual caption.
5. Run each image through LIVE PaddleOCR 2.7.3 for text extraction.
6. Build CaseContext from complaint text + all evidence descriptions.
7. Invoke single-pass LLM Case Understanding Engine (gemma4:e2b / Ollama).
8. Save results to MongoDB Atlas 'cases' collection.
9. Print the full 9-section case understanding report.
"""
import asyncio
import base64
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

import httpx
from motor.motor_asyncio import AsyncIOMotorClient
from app.case_understanding.engine import CaseUnderstandingEngine
from app.case_understanding.repository import MongoCaseRepository
from app.core.config import settings
from app.core.container import get_container
from app.llm.client import OllamaLLMClient
from app.ocr_worker.engine import PaddleOCREngine
from app.schemas.case_context import EvidenceItem

FLORENCE_URL = "http://localhost:8002/predict"


async def get_florence_caption(image_bytes: bytes, task: str = "<MORE_DETAILED_CAPTION>") -> str:
    """Call live Florence-2 microservice on port 8002."""
    b64_str = base64.b64encode(image_bytes).decode("utf-8")
    payload = {"image_base64": b64_str, "task": task}
    async with httpx.AsyncClient(timeout=90) as client:
        res = await client.post(FLORENCE_URL, json=payload)
        res.raise_for_status()
        data = res.json()
        return data.get("result", "")


async def get_paddle_ocr_text(image_bytes: bytes) -> str:
    """Call live PaddleOCR 2.7.3 engine."""
    engine = PaddleOCREngine()
    res = await engine.run(image_bytes)
    return res.raw_text


async def download_image(url: str, evidence_id: str) -> bytes | None:
    """Download image bytes from a URL (Cloudinary secureUrl)."""
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            res = await client.get(url)
            res.raise_for_status()
            return res.content
    except Exception as exc:
        print(f"      [Warning] Could not download evidence {evidence_id}: {exc}")
        return None


async def main():
    print(f"\n{'='*80}")
    print(f"  REAL-TIME END-TO-END PIPELINE")
    print(f"  MongoDB Atlas → Cloudinary Evidence → Florence-2 → PaddleOCR → LLM")
    print(f"{'='*80}\n")

    # Step 1: Connect MongoDB Atlas
    print(f"  [1] Connecting to MongoDB Atlas...")
    ATLAS_URI = settings.MONGODB_URL
    client = AsyncIOMotorClient(ATLAS_URI, serverSelectionTimeoutMS=8000)
    try:
        await client.admin.command("ping")
        print(f"      ✓ Connected to MongoDB Atlas!\n")
    except Exception as exc:
        print(f"      [Error] Atlas connection failed: {exc}")
        return

    db = client[settings.MONGODB_DB_NAME]

    # Step 2: Fetch the target complaint + its evidence array
    TARGET_COMP = "COMP-88958b14-18a5-47b9-ab40-5fc1bc220581"
    print(f"  [2] Fetching complaint [{TARGET_COMP}] from MongoDB Atlas...")
    target_complaint = await db.complaints.find_one({"complaintNumber": TARGET_COMP})

    if not target_complaint:
        print(f"      [Error] Complaint [{TARGET_COMP}] not found in Atlas.")
        return

    case_id = str(target_complaint["_id"])
    complaint_num = target_complaint.get("complaintNumber", case_id)
    short_desc = target_complaint.get("shortDescription", "N/A")
    detailed_desc = target_complaint.get("detailedDescription", short_desc)
    category = target_complaint.get("category", "ROBBERY/ASSAULT")
    incident_place = target_complaint.get("incidentPlace", "Unknown")
    incident_date = str(target_complaint.get("incidentDate", ""))

    # Evidence is embedded IN the complaint document
    raw_evidences = target_complaint.get("evidence", [])

    print(f"      ✓ Mongo _id      : {case_id}")
    print(f"      ✓ Complaint No.  : {complaint_num}")
    print(f"      ✓ Short Summary  : {short_desc}")
    print(f"      ✓ Incident Place : {incident_place}")
    print(f"      ✓ Incident Date  : {incident_date}")
    print(f"      ✓ Evidence files : {len(raw_evidences)}")
    print(f"      ✓ Description    : {detailed_desc[:150]}...\n")

    # Step 3: Download evidence images from Cloudinary and process with Florence-2 + PaddleOCR
    print(f"  [3] Downloading real evidence images from Cloudinary and processing...")
    evidence_items: list[EvidenceItem] = []

    for idx, ev in enumerate(raw_evidences):
        ev_id = str(ev.get("_id", f"ev-{idx}"))
        secure_url = ev.get("secureUrl", "")
        public_id = ev.get("publicId", "")
        resource_type = ev.get("resourceType", "image")
        mime_type = ev.get("mimeType", "image/png")
        original_filename = ev.get("originalFilename", f"evidence_{idx}.png")
        size_bytes = ev.get("size", 0)

        # Already processed AI metadata stored in the complaint
        ai_meta = ev.get("aiMetadata", {})
        existing_caption = ai_meta.get("m4Caption", "") or ai_meta.get("aiSummary", "")
        existing_ocr = ai_meta.get("ocrText", "")
        existing_tags = ai_meta.get("m4Tags", ai_meta.get("imageTags", []))

        print(f"\n      --- Evidence [{idx+1}/{len(raw_evidences)}] ---")
        print(f"          File     : {original_filename}")
        print(f"          Type     : {resource_type} / {mime_type}")
        print(f"          Size     : {size_bytes:,} bytes")
        print(f"          URL      : {secure_url[:80]}...")

        if resource_type != "image" or not secure_url:
            print(f"          [Skip] Not an image or no URL.")
            continue

        # Download the real image
        print(f"          Downloading from Cloudinary...")
        image_bytes = await download_image(secure_url, ev_id)

        if not image_bytes:
            # Fall back to existing AI metadata if download fails
            florence_caption = existing_caption
            ocr_text = existing_ocr
            print(f"          [Fallback] Using existing Atlas AI metadata.")
        else:
            print(f"          ✓ Downloaded {len(image_bytes):,} bytes")

            # Run LIVE Florence-2
            print(f"          Running LIVE Florence-2 <MORE_DETAILED_CAPTION>...")
            try:
                florence_caption = await get_florence_caption(image_bytes)
                print(f"          ✓ Florence-2 Caption: \"{florence_caption[:200]}\"")
            except Exception as exc:
                print(f"          [Warning] Florence-2 error: {exc}. Using existing caption.")
                florence_caption = existing_caption

            # Run LIVE PaddleOCR
            print(f"          Running LIVE PaddleOCR 2.7.3...")
            try:
                ocr_text = await get_paddle_ocr_text(image_bytes)
                print(f"          ✓ PaddleOCR extracted {len(ocr_text)} chars")
                if ocr_text.strip():
                    sample_lines = [l for l in ocr_text.splitlines() if l.strip()][:3]
                    print(f"          Sample lines: {sample_lines}")
                else:
                    print(f"          No text detected by PaddleOCR → using existing OCR.")
                    ocr_text = existing_ocr
            except Exception as exc:
                print(f"          [Warning] PaddleOCR error: {exc}. Using existing OCR.")
                ocr_text = existing_ocr

        # Build EvidenceItem with real data
        evidence_items.append(
            EvidenceItem(
                id=ev_id,
                filename=original_filename,
                type="image",
                florence_description=florence_caption,
                ocr_text=ocr_text,
                metadata={
                    "public_id": public_id,
                    "tags": existing_tags,
                    "size_bytes": size_bytes,
                    "cloudinary_url": secure_url,
                    "existing_ai_summary": existing_caption,
                },
            )
        )

    print(f"\n      ✓ Processed {len(evidence_items)} evidence item(s) with real AI analysis.\n")

    # Step 4: Build CaseContext
    print(f"  [4] Building unified CaseContext (complaint + {len(evidence_items)} evidence items)...")
    container = get_container()
    context = container.case_context_builder.build(
        complaint_text=detailed_desc,
        evidence_items=evidence_items,
        case_id=case_id,
        complaint_metadata={
            "complaint_number": complaint_num,
            "category": category,
            "incident_place": incident_place,
            "incident_date": incident_date,
            "short_description": short_desc,
        },
    )

    # Step 5: Invoke LLM Case Understanding Engine
    print(f"  [5] Invoking Single-Pass LLM Case Understanding Engine ({settings.OLLAMA_MODEL})...")
    llm_client = OllamaLLMClient(
        base_url=settings.OLLAMA_BASE_URL,
        model=settings.OLLAMA_MODEL,
        timeout=settings.OLLAMA_TIMEOUT_SECONDS,
    )
    engine = CaseUnderstandingEngine(llm_client=llm_client)
    case_understanding = await engine.analyze(context)
    print(f"      ✓ LLM analysis complete!\n")

    # Step 6: Save to MongoDB Atlas
    print(f"  [6] Saving CaseUnderstanding to MongoDB Atlas 'cases' collection...")
    repo = MongoCaseRepository(collection_name="cases")
    await repo.save(case_understanding)

    saved_doc = await db.cases.find_one({"case_id": case_id})
    if saved_doc:
        print(f"      ✓ Document saved in Atlas cases collection!")
        print(f"      ✓ Case ID: {saved_doc.get('case_id')}\n")
    else:
        print(f"      [Warning] Could not verify save in Atlas.\n")

    # Step 7: Print Full Results
    print(f"\n{'='*80}")
    print(f"  CASE UNDERSTANDING RESULTS — {complaint_num}")
    print(f"{'='*80}")

    print(f"\n  [1] OVERVIEW")
    ov = case_understanding.overview
    print(f"      Summary    : {ov.complaint_summary}")
    print(f"      Category   : {ov.crime_category} / {ov.crime_subtype}")
    print(f"      Priority   : {ov.priority.upper()} (Confidence: {ov.confidence:.0%})")

    print(f"\n  [2] TIMELINE ({len(case_understanding.timeline)} events)")
    for ev in case_understanding.timeline:
        evids = ", ".join(ev.supporting_evidence_ids) if ev.supporting_evidence_ids else "—"
        print(f"      • [{ev.timestamp}] {ev.description} (Evidence: {evids})")

    print(f"\n  [3] PEOPLE & ENTITIES")
    p = case_understanding.people_and_entities
    print(f"      Victims       : {[v.value for v in p.victims]}")
    print(f"      Suspects      : {[s.value for s in p.suspects]}")
    print(f"      Organizations : {[o.value for o in p.organizations]}")
    print(f"      Locations     : {[l.value for l in p.locations]}")
    print(f"      Vehicles      : {[v.value for v in p.vehicles]}")
    print(f"      Phone Numbers : {[ph.value for ph in p.phone_numbers]}")
    print(f"      Bank Accounts : {[b.value for b in p.bank_accounts]}")
    print(f"      UPI IDs       : {[u.value for u in p.upi_ids]}")

    print(f"\n  [4] EVIDENCE ANALYSIS ({len(case_understanding.evidence_analysis)} items)")
    for ea in case_understanding.evidence_analysis:
        print(f"      • [{ea.evidence_id}] {ea.filename} ({ea.importance.upper()})")
        print(f"        Summary          : {ea.summary[:200]}")
        print(f"        Extracted Info   : {ea.extracted_information[:300]}...")
        print(f"        Allegations      : {ea.allegations_supported}")

    print(f"\n  [5] EVIDENCE CORRELATION ({len(case_understanding.evidence_correlation)} correlations)")
    for corr in case_understanding.evidence_correlation:
        print(f"      • Allegation  : {corr.allegation}")
        print(f"        Corroborated: {corr.explanation} (Confidence: {corr.confidence:.0%})")

    print(f"\n  [6] CRIME ANALYSIS")
    ca = case_understanding.crime_analysis
    print(f"      Category       : {ca.crime_category} / {ca.crime_subtype}")
    print(f"      Modus Operandi : {ca.modus_operandi}")
    print(f"      Digital Assets : {ca.digital_assets_involved}")
    print(f"      Physical Assets: {ca.physical_assets_involved}")
    if ca.estimated_financial_loss:
        print(f"      Financial Loss : ₹{ca.estimated_financial_loss:,.2f}")

    print(f"\n  [7] CONTRADICTIONS ({len(case_understanding.contradictions)})")
    if not case_understanding.contradictions:
        print(f"      None detected.")
    else:
        for c in case_understanding.contradictions:
            sig = getattr(c, 'significance', 'medium')
            print(f"      • {c.description} (Significance: {sig})")

    print(f"\n  [8] MISSING INFORMATION ({len(case_understanding.missing_information)} items)")
    for mi in case_understanding.missing_information:
        print(f"      • [{mi.importance.upper()}] {mi.item} -- {mi.reason}")

    print(f"\n  [9] MISSING EVIDENCE GAPS ({len(case_understanding.missing_evidence)} items)")
    for me in case_understanding.missing_evidence:
        print(f"      • [{me.importance.upper()}] {me.evidence_name} -- {me.reason_relevant}")

    print(f"\n{'='*80}")
    print(f"  ✓ PIPELINE COMPLETE — Real Complaint + Real Images + Real AI Analysis")
    print(f"{'='*80}\n")


if __name__ == "__main__":
    asyncio.run(main())
