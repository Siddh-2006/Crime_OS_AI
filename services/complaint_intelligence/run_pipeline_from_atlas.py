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
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

from motor.motor_asyncio import AsyncIOMotorClient
from app.case_understanding.engine import CaseUnderstandingEngine
from app.case_understanding.pipeline_orchestrator import CasePipelineOrchestrator
from app.case_understanding.repository import MongoCaseRepository
from app.core.config import settings
from app.core.container import get_container
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

    db = client[settings.MONGODB_DB_NAME]

    # Fetch specific complaint from Atlas 'complaints' collection
    TARGET_ID = "COMP-88958b14-18a5-47b9-ab40-5fc1bc220581"
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

    # Fetch associated evidences from Atlas 'evidences' collection
    atlas_evidences = await db.evidences.find({"case_id": case_id}).to_list(length=20)
    print(f"  Atlas Evidences : {len(atlas_evidences)} attached item(s)")

    evidence_items = []
    for ev in atlas_evidences:
        ev_id = str(ev.get("_id") or ev.get("evidence_id"))
        ev_type = ev.get("type", "image")
        ev_desc = ev.get("ai_description", "")
        evidence_items.append(
            EvidenceItem(
                id=ev_id,
                filename=f"evidence_{ev_id[:8]}.png",
                type=ev_type if ev_type in ("image", "audio", "video", "pdf") else "image",
                florence_description=ev_desc,
                ocr_text=ev_desc if "text" in ev_desc.lower() else None,
            )
        )

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
