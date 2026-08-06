"""
Script to fetch a real complaint from MongoDB, run CaseUnderstandingEngine, and output the 5-section JSON structure.
"""
import asyncio
import json
import os
import sys

# Ensure UTF-8 output encoding for Windows stdout
sys.stdout.reconfigure(encoding="utf-8")

from pathlib import Path

# Ensure package root is in sys.path
_SERVICE_DIR = Path(__file__).resolve().parent.parent
if str(_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(_SERVICE_DIR))

from app.core.container import get_container
from app.core.mongo import get_mongo_db
from app.schemas.case_context import CaseContext, EvidenceItem


async def run():
    db = await get_mongo_db()
    if db is None:
        print("MongoDB connection failed!")
        return

    # Find a complaint document that has substantial detailed text and evidence
    doc = await db["complaints"].find_one({
        "detailedDescription": {"$exists": True, "$regex": ".{100,}"}
    })
    if not doc:
        doc = await db["complaints"].find_one({
            "shortDescription": {"$exists": True, "$regex": ".{50,}"}
        })
    if not doc:
        doc = await db["complaints"].find_one({})

    if not doc:
        print("No complaint document found in MongoDB complaints collection!")
        return

    case_id = str(doc.get("complaintNumber") or doc.get("_id"))
    complaint_text = (
        doc.get("detailedDescription")
        or doc.get("shortDescription")
        or doc.get("description")
        or "Complaint text unavailable."
    )

    metadata = {
        "category": doc.get("category") or "Cybercrime",
        "incidentDate": str(doc.get("incidentDate") or ""),
        "policeStation": str(doc.get("policeStation") or ""),
    }

    # Extract evidence items
    evidence_list = []
    raw_evidence = doc.get("evidence") or []
    for i, ev in enumerate(raw_evidence):
        if isinstance(ev, dict):
            ev_id = str(ev.get("_id") or ev.get("id") or f"ev-{i+1}")
            filename = ev.get("originalName") or ev.get("filename") or f"evidence_{i+1}.png"
            ev_type = ev.get("fileType") or ev.get("type") or "image"
            florence = ev.get("caption") or ev.get("florence_description") or ""
            ocr = ev.get("ocrText") or ev.get("ocr_text") or ""
            transcript = ev.get("transcript") or ev.get("audio_transcript") or ""
            pdf_text = ev.get("pdfText") or ev.get("pdf_extracted_text") or ""

            evidence_list.append(
                EvidenceItem(
                    id=ev_id,
                    filename=filename,
                    type=ev_type,
                    florence_description=florence,
                    ocr_text=ocr,
                    audio_transcript=transcript,
                    pdf_extracted_text=pdf_text,
                )
            )

    context = CaseContext(
        case_id=case_id,
        complaint_text=complaint_text,
        complaint_metadata=metadata,
        evidence=evidence_list,
    )

    print(f"Executing Case Understanding on Complaint ID: {case_id}")
    print(f"Complaint Text length: {len(complaint_text)} characters")
    print(f"Evidence items count: {len(evidence_list)}")

    container = get_container()
    engine = container.case_understanding_engine

    result = await engine.analyze(context)

    # Dump the clean 5-section result
    output_dict = result.model_dump(mode="json", exclude_none=True)
    
    # Save output to scratch artifact file for viewing
    output_path = os.path.join(os.path.dirname(__file__), "..", "..", "scratch", "sample_case_understanding_output.json")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output_dict, f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 50)
    print("SUCCESSFULLY GENERATED 5-SECTION CASE UNDERSTANDING JSON:")
    print("=" * 50 + "\n")
    print(json.dumps(output_dict, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(run())
