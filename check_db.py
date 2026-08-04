import asyncio
from pymongo import MongoClient
import json
from bson import json_util

def check_db():
    uri = "mongodb+srv://crimeosxbrightweb_db_user:Xaygb5mGmPh92bFg@crime-os.4gyn7b5.mongodb.net/?appName=crime-os"
    client = MongoClient(uri)
    db = client.get_database("test")
    
    print("\n--- Evidence Profiles with Description ---")
    evidences = list(db.evidence_profiles.find({
        "florence_description": {"$ne": None}
    }).sort('_id', -1).limit(5))
    
    if not evidences:
        print("No evidence profiles have a description!")
    else:
        for ev in evidences:
            print(f"ID: {ev.get('_id')}")
            print(f"Case: {ev.get('case_id')}")
            print(f"Desc: {ev.get('florence_description')}")
            print("-" * 20)
            
    print("\n--- Evidence Profiles for latest complaint ---")
    evidences = list(db.evidence_profiles.find({"case_id": "6a6a615ec560353c648d7cb8"}))
    if not evidences:
        # Maybe case_id is an ObjectId or formatted differently? Let's try matching part of it
        pass
    for ev in evidences:
        print(f"ID: {ev.get('_id')}")
        print(f"Case: {ev.get('case_id')}")
        print(f"Desc: {ev.get('florence_description')}")
        print("-" * 20)

if __name__ == '__main__':
    check_db()
