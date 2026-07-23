"""Check what case_ids exist and what the case doc looks like."""
import asyncio
import sys
import io
sys.path.insert(0, '.')
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

CASE_ID = "6a60d80d02a44c7661fbba92"

async def main():
    client = AsyncIOMotorClient(settings.MONGODB_URL, serverSelectionTimeoutMS=10000)
    db = client[settings.MONGODB_DB_NAME]
    
    # List all cases
    cases = await db.cases.find({}, {"case_id": 1, "created_at": 1}).to_list(length=20)
    print(f"Total cases: {len(cases)}")
    for c in cases:
        print(f"  _id={c.get('_id')} | case_id={c.get('case_id')} | created={c.get('created_at','?')}")
    
    # Fetch the specific one
    doc = await db.cases.find_one({"case_id": CASE_ID})
    if doc:
        print("\nFound case! Top-level keys:", [k for k in doc.keys()])
        overview = doc.get("overview", {})
        print("Overview:", overview)
    else:
        print(f"\nNo case with case_id={CASE_ID}")
        # Try by _id
        from bson import ObjectId
        try:
            doc2 = await db.cases.find_one({"_id": ObjectId(CASE_ID)})
            if doc2:
                print("Found by _id! Keys:", [k for k in doc2.keys()])
        except Exception as e:
            print("ObjectId lookup error:", e)
    
    client.close()

asyncio.run(main())
