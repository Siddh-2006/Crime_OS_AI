from fastapi import FastAPI
from pydantic import BaseModel
import sys
import os

# Add parent directory to path so we can import legal_rag
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from legal_rag.retrieval import LegalRetriever

app = FastAPI(title="Legal Agent API")

retriever = LegalRetriever()

class CopilotRequest(BaseModel):
    query: str

@app.post("/copilot")
def copilot_endpoint(req: CopilotRequest):
    try:
        bundle = retriever.retrieve(req.query, top_k=15, final_k=5)
        
        # Extract the chunks and the legal basis (Act + Section)
        chunks = [item.to_section_block().strip() for item in bundle.all_context_sections()]
        legal_basis = [f"{getattr(item, 'act', 'Unknown')} - {getattr(item, 'serial_number', getattr(item, 'sop_id', getattr(item, 'entity_id', '')))}" for item in bundle.all_context_sections()]
        
        return {
            "retrieved_chunks": chunks,
            "legal_basis": list(set(legal_basis))  # Deduplicate legal basis
        }
    except Exception as e:
        import traceback
        return {"error": str(e), "traceback": traceback.format_exc()}
