"""
POST /recommend-officers

Called by the Node backend when a SHO opens the Approve & Assign IO screen.
Returns AI-ranked Investigation Officers filtered to those available at the station.
"""
import time
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import get_recommend_service
from app.core.logging import logger
from app.schemas.complaint import RecommendOfficersRequest
from app.schemas.recommendation import RecommendOfficersResponse
from app.services.recommendation_service import RecommendationService

router = APIRouter(tags=["Recommendations"])


@router.post(
    "/recommend-officers",
    response_model=RecommendOfficersResponse,
    status_code=status.HTTP_200_OK,
    summary="Recommend Investigation Officers for an open complaint",
    description=(
        "Receives the current complaint and a list of available IOs "
        "(belonging to the complaint's police station). Retrieves semantically "
        "similar closed FIRs from Qdrant, applies weighted cosine-similarity "
        "voting, and returns officers sorted by recommendation score (0-100). "
        "The Node backend must populate officer details from MongoDB."
    ),
)
async def recommend_officers(
    request: RecommendOfficersRequest,
    service: RecommendationService = Depends(get_recommend_service),
) -> RecommendOfficersResponse:
    t0 = time.perf_counter()
    try:
        result = await service.recommend_officers(request)
        return result
    except Exception as exc:
        logger.error(
            "Recommend-officers endpoint error",
            extra={
                "complaintId": request.complaint.complaintId,
                "error": str(exc),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Recommendation pipeline failed: {str(exc)}",
        )
