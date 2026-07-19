import time
from fastapi import APIRouter, Depends, status
from app.api.dependencies import get_orchestrator
from app.services.orchestrator import ComplaintIntelligenceOrchestrator
from app.schemas.complaint import ComplaintAnalyzeRequest
from app.schemas.analysis import ComplaintAnalyzeResponse
from app.core.logging import logger

router = APIRouter(tags=["Analysis"])


@router.post(
    "/analyze-complaint",
    response_model=ComplaintAnalyzeResponse,
    status_code=status.HTTP_200_OK,
    summary="Initialize analysis on a complaint and its attached evidence",
    description="Processes complaint text and attachments through the intake processing and extraction pipeline.",
)
async def analyze_complaint(
    request: ComplaintAnalyzeRequest,
    orchestrator: ComplaintIntelligenceOrchestrator = Depends(get_orchestrator),
) -> ComplaintAnalyzeResponse:
    t0 = time.perf_counter()
    logger.info("Received analyze complaint request", extra={"complaint_id": request.complaint_id})
    try:
        response = await orchestrator.run_pipeline(request)
        elapsed = time.perf_counter() - t0
        logger.info(
            "Completed analyze complaint request",
            extra={"complaint_id": request.complaint_id, "duration_sec": elapsed}
        )
        return response
    except Exception as exc:
        logger.error(
            "Analyze complaint failed",
            extra={"complaint_id": request.complaint_id, "error": str(exc)},
            exc_info=True
        )
        raise exc
