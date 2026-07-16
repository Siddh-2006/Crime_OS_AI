"""
POST /embed-case

Called by the Node backend after a case is CLOSED.
Idempotent — re-submitting the same firId updates the existing vector.
"""
import time
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import get_embed_service
from app.core.logging import logger
from app.schemas.fir import EmbedCaseRequest, EmbedCaseResponse
from app.services.embed_service import EmbedService

router = APIRouter(tags=["Embedding"])


@router.post(
    "/embed-case",
    response_model=EmbedCaseResponse,
    status_code=status.HTTP_200_OK,
    summary="Embed a closed FIR into the vector store",
    description=(
        "Receives a fully closed FIR from the Node backend, "
        "converts it to structured text, generates an embedding using "
        "nomic-embed-text-v2-moe via llama.cpp, and upserts the vector into "
        "Qdrant. Idempotent — calling again with the same firId overwrites the "
        "existing point."
    ),
)
async def embed_case(
    request: EmbedCaseRequest,
    service: EmbedService = Depends(get_embed_service),
) -> EmbedCaseResponse:
    t0 = time.perf_counter()
    try:
        result = await service.embed_case(request)
        return result
    except Exception as exc:
        logger.error(
            "Embed-case endpoint error",
            extra={"firId": request.firId, "error": str(exc)},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Embedding pipeline failed: {str(exc)}",
        )
