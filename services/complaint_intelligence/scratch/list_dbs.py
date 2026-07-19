import os
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient

BACKEND_ENV_PATH = Path(__file__).parent.parent.parent.parent / "backend" / ".env"
load_dotenv(BACKEND_ENV_PATH)
MONGODB_URI = os.getenv("MONGODB_URI")

def list_databases():
    print(f"Connecting to URI: {MONGODB_URI}")
    client = MongoClient(MONGODB_URI)
    dbs = client.list_database_names()
    print(f"Databases: {dbs}")
    
    for db_name in dbs:
        db = client[db_name]
        print(f"\nDatabase: {db_name}")
        cols = db.list_collection_names()
        print(f"  Collections: {cols}")
        for col_name in cols:
            count = db[col_name].count_documents({})
            print(f"    - {col_name}: {count} documents")

if __name__ == "__main__":
    list_databases()
