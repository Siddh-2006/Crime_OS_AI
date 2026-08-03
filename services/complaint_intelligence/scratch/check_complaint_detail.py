import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

async def main():
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client["test"]
    
    comp_num = "COMP-74393ad6-1a88-4cc0-aad4-b99d45e10701"
    doc = await db.complaints.find_one({"complaintNumber": comp_num})
    if not doc:
        print("Complaint not found!")
        return

    comp_id = str(doc["_id"])
    print(f"Complaint ID: {comp_id}")
    print(f"processingStatus: {doc.get('processingStatus')}")
    print(f"complaintIntelligence keys: {list(doc.get('complaintIntelligence', {}).keys())}")

    # Check case_understanding collection
    cu = await db.case_understandings.find_one({"case_id": comp_id})
    if not cu:
        cu = await db.case_understandings.find_one({"complaint_id": comp_id})
    print("case_understandings doc:", bool(cu))

    # Check case_profiles collection
    cp = await db.case_profiles.find_one({"case_id": comp_id})
    print("case_profiles doc:", bool(cp))

    # Check evidence collection in mongo
    ev_docs = await db.evidence.find({"case_id": doc["_id"]}).to_list(100)
    if not ev_docs:
        ev_docs = await db.evidence.find({"case_id": comp_id}).to_list(100)
    print(f"Evidence collection docs count: {len(ev_docs)}")
    for e in ev_docs:
        print(f"  EvDoc: {e.get('originalFilename')} | status={e.get('processingStatus')}")

    # Check Redis reachability
    from app.core.redis import ping_redis
    redis_ok = await ping_redis()
    print("Redis reachable:", redis_ok)

    client.close()

if __name__ == "__main__":
    asyncio.run(main())
