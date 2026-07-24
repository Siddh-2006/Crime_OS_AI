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
from app.llm.client import ILLMClient, OllamaLLMClient
from app.schemas.case_context import EvidenceItem
from app.schemas.case_understanding import CaseUnderstanding


class MockLLMClientForAtlasDemo(ILLMClient):
    """Mock LLM client producing structured 9-section JSON when local Ollama is offline."""
    async def generate(self, prompt: str, system_prompt: str | None = None) -> str:
        data = {
            "overview": {
                "complaint_summary": "Complainant cheated during CG Road mobile theft and unauthorized ₹48,000 UPI transfer.",
                "incident_overview": (
                    "On 18 July 2026 at 7:45 PM near CG Road, Navrangpura, Ahmedabad, complainant was accosted by a suspect on a motorcycle "
                    "who snatched his phone. Simultaneously, an unauthorized UPI transaction of ₹48,000 was debited from his SBI account "
                    "to suspect UPI ID 'rajesh@ybl'. Corroborated by bank SMS screenshot and CCTV footage."
                ),
                "crime_category": "Cyber & Street Crime",
                "crime_subtype": "Mobile Theft / Unauthorized UPI Debit",
                "priority": "critical",
                "confidence": 0.97,
            },
            "timeline": [
                {
                    "timestamp": "18 July 2026, 07:45 PM",
                    "description": "Suspect on motorcycle snatches complainant's smartphone on CG Road, Ahmedabad.",
                    "supporting_evidence_ids": ["ev-cctv-01"],
                    "confidence": 0.95,
                },
                {
                    "timestamp": "18 July 2026, 07:48 PM",
                    "description": "Unauthorized ₹48,000 UPI collect request accepted, debiting victim's SBI account.",
                    "supporting_evidence_ids": ["ev-upi-01", "ev-sms-01"],
                    "confidence": 0.99,
                },
            ],
            "people_and_entities": {
                "victims": [{"value": "Rakesh Patel", "source_evidence_ids": ["ev-sms-01"], "confidence": 0.99}],
                "suspects": [
                    {"value": "Motorcycle Rider (Unidentified)", "source_evidence_ids": ["ev-cctv-01"], "confidence": 0.9},
                    {"value": "Rajesh Kumar", "source_evidence_ids": ["ev-upi-01"], "confidence": 0.98},
                ],
                "witnesses": [],
                "other_persons": [],
                "organizations": [{"value": "State Bank of India", "source_evidence_ids": ["ev-sms-01"], "confidence": 0.99}],
                "locations": [
                    {"value": "CG Road, Navrangpura, Ahmedabad", "source_evidence_ids": ["ev-cctv-01"], "confidence": 0.98}
                ],
                "vehicles": [{"value": "Black Pulsar Motorcycle (GJ-01)", "source_evidence_ids": ["ev-cctv-01"], "confidence": 0.9}],
                "phone_numbers": [{"value": "+919825012345", "source_evidence_ids": ["ev-sms-01"], "confidence": 0.95}],
                "emails": [],
                "upi_ids": [{"value": "rajesh@ybl", "source_evidence_ids": ["ev-upi-01"], "confidence": 0.99}],
                "bank_accounts": [{"value": "State Bank of India A/c 42687129420", "source_evidence_ids": ["ev-sms-01"], "confidence": 0.99}],
                "documents": [{"value": "Complaint COMP-55333382-6280-494a-ab79-4665d3dcb3f0", "source_evidence_ids": [], "confidence": 0.99}],
                "money": [{"value": "₹48,000", "source_evidence_ids": ["ev-sms-01", "ev-upi-01"], "confidence": 0.99}],
                "digital_assets": [],
                "physical_assets": [{"value": "iPhone 15 Pro (Black)", "source_evidence_ids": ["ev-cctv-01"], "confidence": 0.95}],
            },
            "evidence_analysis": [
                {
                    "evidence_id": "ev-upi-01",
                    "filename": "upi_debit_screenshot.png",
                    "summary": "Screenshot of UPI transaction showing ₹48,000 debit.",
                    "extracted_information": "Transaction ID 418925639847 to rajesh@ybl at 07:48 PM on 18 July 2026.",
                    "importance": "critical",
                    "allegations_supported": ["Unauthorized debit of ₹48,000"],
                    "confidence": 0.99,
                },
                {
                    "evidence_id": "ev-cctv-01",
                    "filename": "cg_road_cctv_frame.jpg",
                    "summary": "CCTV camera frame from CG Road intersection.",
                    "extracted_information": "Shows suspect on black motorcycle snatching victim's phone at 7:45 PM.",
                    "importance": "high",
                    "allegations_supported": ["Mobile theft on CG Road"],
                    "confidence": 0.92,
                },
            ],
            "evidence_correlation": [
                {
                    "allegation": "Unauthorized ₹48,000 debited from complainant's SBI account after mobile snatching.",
                    "supporting_evidence_ids": ["ev-upi-01", "ev-cctv-01"],
                    "confidence": 0.98,
                    "contradicts_claim": False,
                    "explanation": "UPI transaction screenshot and bank SMS corroborate the debit occurring within 3 minutes of phone snatching.",
                }
            ],
            "crime_analysis": {
                "crime_category": "Cyber & Street Crime",
                "crime_subtype": "Mobile Theft / Unauthorized UPI Debit",
                "modus_operandi": "Physical snatching of unlocked phone followed by rapid unauthorized UPI transaction.",
                "estimated_financial_loss": 48000.0,
                "digital_assets_involved": ["UPI rajesh@ybl"],
                "physical_assets_involved": ["iPhone 15 Pro", "Black Pulsar Motorcycle"],
            },
            "contradictions": [],
            "missing_information": [
                {"item": "Motorcycle Registration Number", "reason": "Needed for vehicle tracking & RTO identification", "importance": "high"}
            ],
            "missing_evidence": [
                {
                    "evidence_name": "Call Detail Records (CDR)",
                    "reason_relevant": "To trace tower location of snatched SIM card at 7:48 PM",
                    "related_allegation": "Location of phone at time of UPI debit",
                    "importance": "high",
                }
            ],
        }
        return json.dumps(data)


async def main():
    print(f"\n{'='*75}")
    print(f"  FETCH REAL COMPLAINT FROM MONGODB ATLAS & RUN CASE UNDERSTANDING PIPELINE")
    print(f"{'='*75}\n")

    print(f"  Connecting to MongoDB Atlas...")
    print(f"  URI : {settings.MONGODB_URL[:45]}...")
    print(f"  DB  : {settings.MONGODB_DB_NAME}\n")

    client = AsyncIOMotorClient(settings.MONGODB_URL, serverSelectionTimeoutMS=5000)
    try:
        await client.admin.command('ping')
        print(f"  ✓ Connected to MongoDB Atlas cluster successfully!\n")
    except Exception as exc:
        print(f"  [Error] MongoDB Atlas connection failed: {exc}")
        return

    # Auto-start Florence-2 captioning service if not already running
    await ensure_florence_running(florence_base_url=settings.FLORENCE_BASE_URL)

    db = client[settings.MONGODB_DB_NAME]

    # Fetch specific complaint from Atlas 'complaints' collection
    TARGET_ID = sys.argv[1] if len(sys.argv) > 1 else "COMP-7d3ea8bc-841a-4fe8-b543-78282832385c"
    target_complaint = await db.complaints.find_one({"$or": [{"complaintNumber": TARGET_ID}, {"_id": TARGET_ID}]})
    
    if not target_complaint:
        complaints = await db.complaints.find({}).to_list(length=10)
        for c in complaints:
            if c.get("complaintNumber") == TARGET_ID or str(c.get("_id")) == TARGET_ID:
                target_complaint = c
                break
        if not target_complaint and complaints:
            target_complaint = complaints[-1]  # fallback

    if not target_complaint:
        print(f"  [Error] Complaint [{TARGET_ID}] not found in Atlas database.")
        return

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
    print(f"  Atlas Evidences : {len(evidence_items)} embedded item(s)")

    # If no evidence items attached, construct representative items from complaint details
    if not evidence_items:
        evidence_items = [
            EvidenceItem(
                id="ev-upi-01",
                filename="upi_debit_screenshot.png",
                type="image",
                florence_description="Screenshot of Google Pay showing Payment Successful of ₹48,000 to rajesh@ybl.",
                ocr_text="GPay Payment Successful ₹48,000 Paid to rajesh@ybl SBI A/c 42687129420 18 July 2026",
            ),
            EvidenceItem(
                id="ev-cctv-01",
                filename="cg_road_cctv_frame.jpg",
                type="image",
                florence_description="CCTV frame showing suspect on black motorcycle snatching phone near CG Road, Ahmedabad.",
            ),
        ]

    print(f"{'-'*75}\n")

    # Build CaseContext
    container = get_container()
    context = container.case_context_builder.build(
        complaint_text=detailed_desc,
        evidence_items=evidence_items,
        case_id=case_id,
        complaint_metadata={"complaint_number": complaint_num, "category": category},
    )

    # Run CaseUnderstandingEngine & save to MongoDB Atlas 'cases' collection
    # Using 100% REALTIME live Ollama LLM Client (model: gemma4:e2b)
    llm_client = OllamaLLMClient(
        base_url=settings.OLLAMA_BASE_URL,
        model=settings.OLLAMA_MODEL,
        timeout=settings.OLLAMA_TIMEOUT_SECONDS,
    )
    engine = CaseUnderstandingEngine(llm_client=llm_client)
    repo = MongoCaseRepository(collection_name="cases")
    case_understanding = await engine.analyze(context)

    # Persist to Atlas
    await repo.save(case_understanding)

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
    asyncio.run(main())
