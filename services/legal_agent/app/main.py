from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
import sys
import os
import time
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("legal_agent")
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from legal_rag.retrieval import LegalRetriever
from legal_rag.embedding import (
    BGEEmbedder,
    BGEEmbeddingConfig,
    build_dept_embedding_text,
    DOCUMENT_PREFIX,
)
from legal_rag.qdrant_store import LegalQdrantStore
from legal_rag.models import EmbeddedDocumentRecord
from ingestion.schemas import DeptRegistryRecord

from contextlib import asynccontextmanager

embedder = None
retriever = None
store = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global embedder, retriever, store
    # ── Shared singletons ─────────────────────────────────────────────────────────
    # BGEEmbedder tries sentence-transformers on first use.
    # If not installed, it automatically falls back to NomicEmbedder (llama.cpp).
    # The _resolve() call here forces the check at startup so the log appears
    # immediately rather than on the first incoming request.
    print("[app/main] Initialising embedder — checking for sentence-transformers (BGE)...", file=sys.stderr)
    _embedder_config = BGEEmbeddingConfig()
    embedder = BGEEmbedder(config=_embedder_config)
    embedder._resolve()   # trigger the BGE-vs-Nomic decision at startup

    store     = LegalQdrantStore()
    retriever = LegalRetriever(embedder=embedder, store=store)
    yield

app = FastAPI(title="Legal Agent API", lifespan=lifespan)

@app.get("/health", tags=["Health"], summary="Service health check")
def health():
    return {"status": "ok", "service": "legal-agent"}

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    try:
        body_bytes = await request.body()
        async def receive():
            return {"type": "http.request", "body": body_bytes}
        request._receive = receive
        body_str = body_bytes.decode('utf-8')
    except Exception:
        body_str = "<could not read body>"

    logger.info(f"Incoming Request: {request.method} {request.url.path} | Body: {body_str[:500]}")
    
    response = await call_next(request)
    process_time = time.time() - start_time
    
    logger.info(f"Response: {request.method} {request.url.path} | Status: {response.status_code} | Time: {process_time:.4f}s")
    return response


# ─── Copilot endpoint (unchanged) ────────────────────────────────────────────

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
    qdrant_uuid: Optional[str] = None


@app.post("/registry/upsert")
def registry_upsert(req: DeptRegistryUpsertRequest):
    """
    Embed a single department registry record and upsert it into Qdrant.
    Uses BGEEmbedder (falls back to Nomic if sentence-transformers unavailable).
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

        print(
            f"[registry/upsert] Embedding dept record '{req.entity_id}' "
            f"via {'BGE' if not embedder._fallback else 'Nomic (fallback)'}",
            file=sys.stderr,
        )

        # Build embedding text and embed using whichever backend is active
        embedding_text = build_dept_embedding_text(record)

        if embedder._fallback:
            # Nomic path — apply document prefix
            vector = embedder._fallback._embed_one(
                DOCUMENT_PREFIX + embedding_text, label="dept_doc"
            )
        else:
            # BGE path — symmetric, no prefix needed
            vector = embedder.embed_texts([embedding_text])[0]

        embedded = EmbeddedDocumentRecord(
            record=record,
            embedding_text=embedding_text,
            embedding=vector,
            **({"uuid": req.qdrant_uuid} if req.qdrant_uuid else {}),
        )

        store.upsert_embeddings([embedded])

        print(
            f"[registry/upsert] Upserted '{req.entity_id}' → Qdrant uuid={embedded.uuid}",
            file=sys.stderr,
        )
        return {"success": True, "qdrant_uuid": embedded.uuid}

    except Exception as e:
        import traceback
        raise HTTPException(
            status_code=500,
            detail={"error": str(e), "traceback": traceback.format_exc()},
        )


@app.delete("/registry/{uuid}")
def registry_delete(uuid: str):
    """Delete a single department registry point from Qdrant by UUID."""
    try:
        store.delete_by_uuid(uuid)
        print(f"[registry/delete] Deleted Qdrant point {uuid}", file=sys.stderr)
        return {"success": True, "deleted_uuid": uuid}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
