import asyncio
import os
import sys
from pathlib import Path
from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient

# Add app directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.absolute()))

from app.schemas.complaint import ComplaintAnalyzeRequest, EvidenceItem
from app.services.orchestrator import ComplaintIntelligenceOrchestrator

# Load MongoDB connection URI from backend's .env file
BACKEND_ENV_PATH = Path(__file__).parent.parent.parent.parent / "backend" / ".env"
load_dotenv(BACKEND_ENV_PATH)
MONGODB_URI = os.getenv("MONGODB_URI")


async def run_db_analysis():
    if not MONGODB_URI:
        print("ERROR: MONGODB_URI not found in backend/.env file.")
        return

    print(f"Connecting to MongoDB...")
    client = MongoClient(MONGODB_URI)
    db = client["test"]
    complaints_col = db["complaints"]

    complaint_id = "6a5cfa6ba5d750495059dbc3"
    print(f"Fetching complaint {complaint_id}...")
    doc = complaints_col.find_one({"_id": ObjectId(complaint_id)})

    if not doc:
        print(f"ERROR: Complaint with ID {complaint_id} not found in database.")
        return

    print(f"\n--- Complaint Details ---")
    print(f"Number: {doc.get('complaintNumber')}")
    print(f"Short Description: {doc.get('shortDescription')}")
    print(f"Detailed Description Length: {len(doc.get('detailedDescription', ''))} chars")
    print(f"Evidence Attached: {len(doc.get('evidence', []))} items")

    # 1. Translate database evidence array to EvidenceItem schemas
    evidence_items = []
    for file in doc.get("evidence", []):
        evidence_items.append(
            EvidenceItem(
                publicId=file["publicId"],
                secureUrl=file["secureUrl"],
                resourceType=file["resourceType"],
                mimeType=file["mimeType"],
                originalFilename=file["originalFilename"],
                extension=file["extension"],
                size=file["size"]
            )
        )

    # 2. Setup ComplaintAnalyzeRequest
    request = ComplaintAnalyzeRequest(
        complaintId=str(doc["_id"]),
        detailedDescription=doc["detailedDescription"],
        shortDescription=doc.get("shortDescription"),
        evidence=evidence_items
    )

    # 3. Instantiate Orchestrator and run the pipeline
    orchestrator = ComplaintIntelligenceOrchestrator()
    print("\nRunning intelligence pipeline (Layer 3)...")
    response = await orchestrator.run_pipeline(request)

    print("\n=== PIPELINE EXECUTION SUCCESS ===")
    print(f"Preprocessing Message: {response.message}")
    print(f"Detected Language: {response.preprocessed.detected_language}")

    # 4. Prepare updates for database
    updated_evidence_list = []
    for orig_file in doc.get("evidence", []):
        pub_id = orig_file["publicId"]
        # Find matching processed item from pipeline
        processed_item = next((ev for ev in response.evidence if ev.public_id == pub_id), None)
        
        if processed_item:
            print(f"Enriching evidence {orig_file['originalFilename']}:")
            print(f"  Classification: {processed_item.classification} ({processed_item.classification_confidence})")
            print(f"  Visual Tags: {processed_item.ai_metadata.image_tags}")
            print(f"  OCR Text Sample: {repr(processed_item.ai_metadata.ocr_text[:60] if processed_item.ai_metadata.ocr_text else '')}")
            
            # Enrich the database evidence metadata item
            orig_file["processingStatus"] = "PROCESSED"
            orig_file["aiMetadata"] = {
                "ocrText": processed_item.ai_metadata.ocr_text or "",
                "speechTranscript": "",
                "imageTags": processed_item.ai_metadata.image_tags or [],
                "detectedObjects": [],
                "faces": [],
                "embeddings": [],
                "virusScanResult": "CLEAN",
                "aiSummary": "",
                "processingErrors": processed_item.ai_metadata.processing_errors or [],
                # New Phase 3 metadata fields mapped to Mongoose schema
                "classification": processed_item.classification or "Unknown",
                "classificationConfidence": float(processed_item.classification_confidence or 0.0),
                "width": int(processed_item.metadata.width or 0),
                "height": int(processed_item.metadata.height or 0),
                "fileType": processed_item.metadata.file_type or "UNKNOWN",
                "exif": processed_item.metadata.exif or {},
                "gps": processed_item.metadata.gps or {}
            }
        else:
            orig_file["processingStatus"] = "FAILED"
            
        updated_evidence_list.append(orig_file)

    # Update root complaint
    update_data = {
        "$set": {
            "processingStatus": "PROCESSED",
            "evidence": updated_evidence_list
        }
    }

    print("\nWriting updates back to MongoDB...")
    result = complaints_col.update_one({"_id": ObjectId(complaint_id)}, update_data)
    
    if result.modified_count > 0:
        print("MongoDB update completed successfully! Complaint has been processed and saved.")
    else:
        print("MongoDB was already up to date, or document was not modified.")


if __name__ == "__main__":
    asyncio.run(run_db_analysis())
