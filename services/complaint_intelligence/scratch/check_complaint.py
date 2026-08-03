import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

async def main():
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    dbs = await client.list_database_names()
    print("Databases in MongoDB:", dbs)
    
    for db_name in dbs:
        if db_name in ["admin", "config", "local"]:
            continue
        db = client[db_name]
        cols = await db.list_collection_names()
        if "complaints" in cols:
            print(f"\n--- Checking DB: '{db_name}' ---")
            count = await db.complaints.count_documents({})
            print(f"Total complaints in '{db_name}':", count)
            recent = await db.complaints.find().sort("_id", -1).limit(5).to_list(10)
            for r in recent:
                print(f"  Num: {r.get('complaintNumber')}, Status: {r.get('processingStatus')}, EvCount: {len(r.get('evidence', []))}")
                for ev in r.get('evidence', []):
                    print(f"    Ev: {ev.get('originalFilename')} | status={ev.get('processingStatus')}")

    client.close()

if __name__ == "__main__":
    asyncio.run(main())
