import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

async def main():
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client["test"]
    
    comp_num = "COMP-74393ad6-1a88-4cc0-aad4-b99d45e10701"
    doc = await db.complaints.find_one({"complaintNumber": comp_num})
    if not doc:
        print("Complaint not found in 'test' db!")
        return

    comp_id = doc["_id"]
    print(f"Complaint _id: {comp_id} (str: {str(comp_id)})")

    # List all collections in DB
    cols = await db.list_collection_names()
    print("Collections in DB:", cols)

    for cname in cols:
        count = await db[cname].count_documents({})
        print(f"Collection '{cname}' document count: {count}")

    # Inspect 'evidences' collection if present
    if "evidences" in cols:
        evs = await db.evidences.find().to_list(100)
        print(f"\nFound {len(evs)} items in 'evidences' collection:")
        for ev in evs:
            print(f"  ID: {ev.get('_id')}, case_id: {ev.get('case_id')}, filename: {ev.get('originalFilename') or ev.get('filename')}, status: {ev.get('processingStatus')}")
            print(f"  aiMetadata present: {bool(ev.get('aiMetadata'))}")
            if ev.get('aiMetadata'):
                print(f"    aiMetadata keys: {list(ev['aiMetadata'].keys())}")

    # Inspect 'evidence' collection if present
    if "evidence" in cols:
        evs = await db.evidence.find().to_list(100)
        print(f"\nFound {len(evs)} items in 'evidence' collection:")
        for ev in evs:
            print(f"  ID: {ev.get('_id')}, case_id: {ev.get('case_id')}, filename: {ev.get('originalFilename') or ev.get('filename')}, status: {ev.get('processingStatus')}")
            print(f"  aiMetadata present: {bool(ev.get('aiMetadata'))}")
            if ev.get('aiMetadata'):
                print(f"    aiMetadata keys: {list(ev['aiMetadata'].keys())}")

    client.close()

if __name__ == "__main__":
    asyncio.run(main())
