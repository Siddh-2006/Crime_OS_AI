"""
M9 Intelligence Fusion — REST API.

GET  /fusion/health  — health check
POST /fusion         — fuse complaint profile and evidence profiles into InvestigationContext
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_di_container
from app.core.container import Container
from app.schemas.fusion import FusionInput, InvestigationContext

router = APIRouter(prefix="/fusion", tags=["Intelligence Fusion"])


@router.get(
    "/health",
    summary="Intelligence Fusion health check",
)
async def fusion_health():
    return {
        "status": "ok",
        "service": "intelligence_fusion",
        "components": ["entity_merger", "event_merger", "fusion_engine"],
    }


@router.post(
    "",
    response_model=InvestigationContext,
    status_code=status.HTTP_200_OK,
    summary="Fuse complaint profile and evidence items into a unified InvestigationContext",
    description=(
        "Accepts a complaint profile, extracted entities, extracted events, and evidence references. "
        "Deduplicates entities across all sources, merges and orders events chronologically, "
        "and returns a consolidated InvestigationContext for downstream analysis."
    ),
)
async def fuse_intelligence(
    payload: FusionInput,
    container: Container = Depends(get_di_container),
):
    try:
        fusion_engine = container.fusion_engine
        context = fusion_engine.fuse(payload)
        return context
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Intelligence Fusion failed: {exc}",
        )
