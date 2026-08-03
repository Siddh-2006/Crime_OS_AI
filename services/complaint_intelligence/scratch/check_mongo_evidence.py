import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
import json
from bson import json_util

async def main():
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client["test"]
    
    comp_num = "COMP-74393ad6-1a88-4cc0-aad4-b99d45e10701"
    doc = await db.complaints.find_one({"complaintNumber": comp_num})
    print("=== COMPLAINT DOC EVIDENCE ARRAY ===")
    if doc:
        evs = doc.get("evidence", [])
        for i, ev in enumerate(evs):
            print(f"\n--- Ev[{i}] ---")
            print(json.dumps(json.loads(json_util.dumps(ev)), indent=2))
    
    print("\n=== EVIDENCES COLLECTION DOCS ===")
    ev_docs = await db.evidences.find({"$or": [{"case_id": doc["_id"]}, {"case_id": str(doc["_id"])}]}).to_list(100)
    print(f"Total in evidences collection: {len(ev_docs)}")
    for i, ed in enumerate(ev_docs):
        print(f"\n--- EvDoc[{i}] ---")
        print(json.dumps(json.loads(json_util.dumps(ed)), indent=2))

    client.close()

if __name__ == "__main__":
    asyncio.run(main())
