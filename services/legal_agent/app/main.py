from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from legal_rag.retrieval import LegalRetriever
from legal_rag.embedding import NomicEmbedder, build_dept_embedding_text
from legal_rag.qdrant_store import LegalQdrantStore
from legal_rag.models import EmbeddedDocumentRecord
from ingestion.schemas import DeptRegistryRecord

app = FastAPI(title="Legal Agent API")

retriever = LegalRetriever()
embedder = NomicEmbedder()
store = LegalQdrantStore()


# ─── Existing copilot endpoint (unchanged) ────────────────────────────────────

class CopilotRequest(BaseModel):
    query: str

@app.post("/copilot")
def copilot_endpoint(req: CopilotRequest):
    try:
        bundle = retriever.retrieve(req.query, top_k=15, final_k=5)
        chunks = [item.to_section_block().strip() for item in bundle.all_context_sections()]
        legal_basis = [
            f"{getattr(item, 'act', 'Unknown')} - "
            f"{getattr(item, 'serial_number', getattr(item, 'sop_id', getattr(item, 'entity_id', '')))}"
            for item in bundle.all_context_sections()
        ]
        return {
            "retrieved_chunks": chunks,
            "legal_basis": list(set(legal_basis)),
        }
    except Exception as e:
        import traceback
        return {"error": str(e), "traceback": traceback.format_exc()}


# ─── Department Registry vector management ───────────────────────────────────

class DeptRegistryUpsertRequest(BaseModel):
    """
    Mirrors the DepartmentRegistry MongoDB document fields relevant for embedding.
    qdrant_uuid is optional — if provided the existing point is overwritten (update),
    if omitted a new UUID is generated (create).
    """
    entity_id: str
    entity_name: str
    category: str
    what_they_can_provide: List[str] = []
    legal_basis_typically_cited: List[str] = []
    request_format_expected: str = ""
    typical_response_time: str = ""
    escalation_path_if_no_response: str = ""
    notes_or_caveats: str = ""
    confidence: str = "high"
    act: str = "department_registry"
    qdrant_uuid: Optional[str] = None  # if set, reuse this UUID (update in-place)


@app.post("/registry/upsert")
def registry_upsert(req: DeptRegistryUpsertRequest):
    """
    Embed a single department registry record and upsert it into Qdrant.
    Returns the Qdrant point UUID so the caller can persist it in MongoDB.

    - Create: omit qdrant_uuid → new UUID generated and returned.
    - Update: pass existing qdrant_uuid → same point overwritten with new vector + payload.
    """
    try:
        record = DeptRegistryRecord(
            act=req.act,
            entity_id=req.entity_id,
            entity_name=req.entity_name,
            category=req.category,
            what_they_can_provide=req.what_they_can_provide,
            legal_basis_typically_cited=req.legal_basis_typically_cited,
            request_format_expected=req.request_format_expected,
            typical_response_time=req.typical_response_time,
            escalation_path_if_no_response=req.escalation_path_if_no_response,
            notes_or_caveats=req.notes_or_caveats,
            confidence=req.confidence,
        )

        embedding_text = build_dept_embedding_text(record)
        # Use document prefix — this is an indexing operation, not a query
        from legal_rag.embedding import DOCUMENT_PREFIX
        vector = embedder._embed_one(DOCUMENT_PREFIX + embedding_text, label="doc")

        embedded = EmbeddedDocumentRecord(
            record=record,
            embedding_text=embedding_text,
            embedding=vector,
            **({"uuid": req.qdrant_uuid} if req.qdrant_uuid else {}),
        )

        store.upsert_embeddings([embedded])

        return {"success": True, "qdrant_uuid": embedded.uuid}

    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail={"error": str(e), "traceback": traceback.format_exc()})


@app.delete("/registry/{uuid}")
def registry_delete(uuid: str):
    """
    Delete a single department registry point from Qdrant by its UUID.
    Called when a department is deactivated.
    """
    try:
        store.delete_by_uuid(uuid)
        return {"success": True, "deleted_uuid": uuid}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
