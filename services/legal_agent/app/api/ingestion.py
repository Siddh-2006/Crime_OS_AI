from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks, HTTPException
from typing import Dict, Optional
import uuid
import sys
import logging
logger = logging.getLogger("legal_agent")


from ingestion.extract_text import extract_pdf_pages
from ingestion.schemas import LegalSectionRecord
from legal_rag.models import EmbeddedDocumentRecord
# We assume embedder and store are accessible from main.py via globals or passed in.
# To avoid circular imports, we'll access them from app.main at runtime if needed, 
# or just import the singletons directly.

router = APIRouter(prefix="/ingest", tags=["Ingestion"])

# Simple in-memory job tracker for the UI to poll
JOBS: Dict[str, dict] = {}

def process_file_background(job_id: str, file_path: str, doc_type: str):
    try:
        from app.main import embedder, store
        
        JOBS[job_id]["status"] = "Extracting text"
        logger.info(f"[RAG Ingestion] Started processing {file_path} (Type: {doc_type})")
        logger.info(f"[RAG Ingestion] Job ID: {job_id}")
        pages = extract_pdf_pages(file_path)
        
        # Simple generic chunking for SOPs / unhandled docs
        logger.info(f"[RAG Ingestion] Extraction complete. Found {len(pages)} pages.")
        JOBS[job_id]["status"] = "Chunking and Embedding"
        logger.info("[RAG Ingestion] Starting chunking and embedding process...")
        records = []
        
        if doc_type.upper() in ["BNS", "BNSS", "BSA"]:
            # Ideally call parse_bns but to keep it robust and generic, we chunk by page for now,
            # or you can hook in the exact parse_bns.py logic here. 
            # For brevity in this implementation, we will chunk generically.
            pass

        # Generic chunking by page
        for i, page in enumerate(pages):
            text = page.raw_text
            if not text.strip():
                continue
            
            emb_text = f"Document: {doc_type}\nPage: {i+1}\n{text[:1000]}"
            vector = embedder.embed(emb_text)
            
            rec = EmbeddedDocumentRecord(
                id=str(uuid.uuid4()),
                embedding=vector,
                record={
                    "section_id": f"{doc_type}_page_{i}",
                    "title": f"{doc_type} - Page {i+1}",
                    "description": text[:500],
                    "chapter": "General",
                    "chapter_title": "General"
                }
            )
            records.append(rec)
            
        logger.info(f"[RAG Ingestion] Embedding complete. Generated {len(records)} vector records.")
        JOBS[job_id]["status"] = "Storing in Qdrant"
        logger.info("[RAG Ingestion] Upserting records into Qdrant vector database...")
        store.upsert_documents(records)
        
        JOBS[job_id]["status"] = "Completed"
        logger.info(f"[RAG Ingestion] SUCCESS: Job {job_id} fully ingested and indexed!")
        
    except Exception as e:
        JOBS[job_id]["status"] = f"Failed: {str(e)}"
    finally:
        # Cleanup temp file
        if os.path.exists(file_path):
            os.remove(file_path)

@router.post("")
async def ingest_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    doc_type: str = Form(...)
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDFs are supported")
        
    job_id = str(uuid.uuid4())
    temp_path = f"/tmp/{job_id}_{file.filename}"
    
    # ensure /tmp exists or use local temp
    os.makedirs("/tmp", exist_ok=True)
    with open(temp_path, "wb") as f:
        f.write(await file.read())
        
    JOBS[job_id] = {"status": "Pending", "doc_type": doc_type, "filename": file.filename}
    background_tasks.add_task(process_file_background, job_id, temp_path, doc_type)
    
    return {"job_id": job_id, "status": "Pending"}

@router.get("/status/{job_id}")
async def get_status(job_id: str):
    if job_id not in JOBS:
        raise HTTPException(status_code=404, detail="Job not found")
    return JOBS[job_id]
