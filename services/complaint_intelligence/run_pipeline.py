"""
Run the full M2 ComplaintProfileWorker pipeline on a complaint from MongoDB.
Usage: .venv\Scripts\python.exe run_pipeline.py
"""
import asyncio
import os
import sys
import json
from pathlib import Path

# ── path setup ────────────────────────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).parent.absolute()))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / "backend" / ".env")

from pymongo import MongoClient
from bson import ObjectId

from app.llm.client import OllamaLLMClient
from app.llm.worker import ComplaintProfileWorker
from app.core.config import settings

COMPLAINT_NUMBER = "COMP-55333382-6280-494a-ab79-4665d3dcb3f0"
SEP = "=" * 70


async def main():
    # ── 1. Fetch complaint from MongoDB ───────────────────────────────────────
    mongo_uri = os.getenv("MONGODB_URI")
    client = MongoClient(mongo_uri)
    db = client["test"]
    doc = db["complaints"].find_one({"complaintNumber": COMPLAINT_NUMBER})

    if not doc:
        print(f"Complaint {COMPLAINT_NUMBER} not found.")
        return

    print(SEP)
    print(f"COMPLAINT INTELLIGENCE — Full M2 Pipeline")
    print(SEP)
    print(f"Number      : {doc['complaintNumber']}")
    print(f"Status      : {doc.get('status')}")
    print(f"Category    : {doc.get('category', 'N/A')}")
    print(f"Short Desc  : {doc.get('shortDescription')}")
    print(f"Incident At : {doc.get('incidentDate')} {doc.get('incidentTime','')}")
    print(f"Location    : {doc.get('incidentPlace','')[:80]}")
    print()

    complaint_text = doc.get("detailedDescription", "")
    print(f"Narrative ({len(complaint_text)} chars):")
    print(f"  {complaint_text[:200]}...")
    print()

    # ── 2. Initialise LLM client + worker ─────────────────────────────────────
    llm = OllamaLLMClient(
        base_url=settings.OLLAMA_BASE_URL,
        model=settings.OLLAMA_MODEL,
        timeout=settings.OLLAMA_TIMEOUT_SECONDS,
        num_ctx=settings.OLLAMA_NUM_CTX,
    )
    worker = ComplaintProfileWorker(llm_client=llm)

    print(f"Model       : {settings.OLLAMA_MODEL} @ {settings.OLLAMA_BASE_URL}")
    print(f"Running pipeline... (Gemma reasoning may take ~60-120s on CPU)")
    print(SEP)

    # ── 3. Run pipeline ────────────────────────────────────────────────────────
    result = await worker.run(
        payload={"text": complaint_text},
        job_id=f"m2-{doc['_id']}",
    )

    # ── 4. Print results ───────────────────────────────────────────────────────
    print()
    if result.succeeded:
        print("PIPELINE STATUS : COMPLETED")
        print(f"Duration        : {result.duration_ms:.0f} ms")
        print()

        profile = result.output
        print(SEP)
        print("COMPLAINT PROFILE (Structured Output)")
        print(SEP)
        print(f"Crime Type      : {profile['crime_type']}")
        print(f"Priority        : {profile['priority'].upper()}")
        print(f"Confidence      : {profile['confidence']:.0%}")
        print()
        print("Summary:")
        print(f"  {profile['summary']}")
        print()
        print("Missing Information:")
        for i, m in enumerate(profile.get('missing_information', []), 1):
            print(f"  {i}. {m}")
        print()
        print("Recommended Next Steps:")
        for i, r in enumerate(profile.get('recommendations', []), 1):
            print(f"  {i}. {r}")
        print()
        print(SEP)
        print("Full JSON output:")
        print(json.dumps(profile, indent=2))

        # ── 5. Write back to MongoDB ───────────────────────────────────────────
        db["complaints"].update_one(
            {"_id": doc["_id"]},
            {"$set": {
                "complaintIntelligence.crimeType":        profile["crime_type"],
                "complaintIntelligence.priority":         profile["priority"],
                "complaintIntelligence.confidence":       profile["confidence"],
                "complaintIntelligence.summary":          profile["summary"],
                "complaintIntelligence.missingInformation": profile.get("missing_information", []),
                "complaintIntelligence.recommendations":  profile.get("recommendations", []),
                "complaintIntelligence.m2ProcessedAt":    __import__("datetime").datetime.utcnow().isoformat(),
            }}
        )
        print()
        print("Results written to MongoDB complaintIntelligence field.")

    else:
        print("PIPELINE STATUS : FAILED")
        print(f"Error     : {result.error}")
        print(f"Duration  : {result.duration_ms:.0f} ms")


if __name__ == "__main__":
    asyncio.run(main())
