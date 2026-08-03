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

    comp_id = doc["_id"]
    evidence_list = doc.get("evidence", [])

    ev_docs = await db.evidences.find({"$or": [{"case_id": comp_id}, {"case_id": str(comp_id)}]}).to_list(100)
    ev_map = {}
    for ed in ev_docs:
        fn = ed.get("originalFilename") or ed.get("filename")
        if fn:
            ev_map[fn] = ed

    for ev in evidence_list:
        fn = ev.get("originalFilename", "")
        matching_doc = ev_map.get(fn)
        if matching_doc:
            florence_desc = matching_doc.get("florence_description") or matching_doc.get("ai_metadata", {}).get("aiSummary")
            ocr_text = matching_doc.get("ocr_text") or matching_doc.get("ai_metadata", {}).get("ocrText")
            tags = matching_doc.get("ai_tags") or matching_doc.get("tags") or []
            
            if florence_desc and florence_desc != "Processed image evidence.":
                ai_meta = ev.get("aiMetadata") or {}
                ai_meta["aiSummary"] = florence_desc
                if ocr_text:
                    ai_meta["ocrText"] = ocr_text
                if tags:
                    ai_meta["imageTags"] = tags
                
                ev["aiMetadata"] = ai_meta
                ev["processingStatus"] = "PROCESSED"
                
                await db.evidences.update_many(
                    {"$or": [{"case_id": comp_id}, {"case_id": str(comp_id)}], "originalFilename": fn},
                    {"$set": {
                        "processingStatus": "PROCESSED",
                        "processing_status": "PROCESSED",
                        "aiMetadata": ai_meta,
                        "ai_metadata": ai_meta,
                        "florence_description": florence_desc
                    }}
                )

    await db.complaints.update_one(
        {"_id": comp_id},
        {"$set": {"evidence": evidence_list}}
    )
    print("DONE: Successfully synced rich Florence descriptions & OCR text into MongoDB!")

    client.close()

if __name__ == "__main__":
    asyncio.run(main())
