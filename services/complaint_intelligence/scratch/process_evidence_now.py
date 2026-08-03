import asyncio
import base64
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
from app.core.container import get_container

async def main():
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client["test"]
    
    comp_num = "COMP-74393ad6-1a88-4cc0-aad4-b99d45e10701"
    doc = await db.complaints.find_one({"complaintNumber": comp_num})
    if not doc:
        print("Complaint not found!")
        return

    comp_id = doc["_id"]
    print("=== Processing Evidence Items directly ===")
    evidence_list = doc.get("evidence", [])
    print(f"Total evidence items: {len(evidence_list)}")

    container = get_container()
    image_worker = container.image_worker

    for idx, ev in enumerate(evidence_list):
        filename = ev.get("originalFilename", "")
        url = ev.get("secureUrl", "")
        mime = ev.get("mimeType", "image/png")
        print(f"\nProcessing Ev[{idx}]: {filename} ({mime})")
        
        try:
            import httpx
            async with httpx.AsyncClient() as http:
                resp = await http.get(url, timeout=30.0)
                file_bytes = resp.content

            b64_str = base64.b64encode(file_bytes).decode("ascii")
            
            result = await image_worker.process(
                job_id=f"direct_job_{idx}",
                payload={
                    "image_bytes_b64": b64_str,
                    "file_name": filename,
                    "file_size_bytes": len(file_bytes)
                },
                attempt=1
            )
            print(f"  Worker result: {result.keys() if isinstance(result, dict) else type(result)}")
            
            # Extract profile / result
            profile = result.get("profile", {}) if isinstance(result, dict) else {}
            ocr_text = profile.get("ocr_text") or result.get("ocr_text") or ""
            tags = profile.get("tags") or result.get("tags") or []
            caption = profile.get("caption") or result.get("caption") or ""
            
            ai_metadata = {
                "ocrText": ocr_text,
                "imageTags": tags,
                "aiSummary": caption or (f"Extracted image evidence ({len(ocr_text)} chars OCR text)." if ocr_text else "Processed image evidence."),
                "classification": "DOCUMENT" if ocr_text else "IMAGE",
                "classificationConfidence": 0.95
            }

            ev["processingStatus"] = "PROCESSED"
            ev["aiMetadata"] = ai_metadata

            # Also update evidences collection document
            await db.evidences.update_many(
                {"case_id": comp_id, "originalFilename": filename},
                {"$set": {"processingStatus": "PROCESSED", "aiMetadata": ai_metadata}}
            )
            print(f"  Successfully processed and updated status for {filename}")
        except Exception as e:
            print(f"  Worker failed for {filename}: {e}")
            import traceback
            traceback.print_exc()

    # Save updated complaint evidence to Mongo
    await db.complaints.update_one(
        {"_id": comp_id},
        {"$set": {"evidence": evidence_list}}
    )
    print("\nUpdated complaint and evidences collections in MongoDB successfully!")

    client.close()

if __name__ == "__main__":
    asyncio.run(main())
