"""
M10 Deterministic Timeline Engine — REST API.

GET  /timeline/health — health check
POST /timeline        — build timeline from InvestigationContext
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_di_container
from app.core.container import Container
from app.schemas.fusion import InvestigationContext
from app.schemas.timeline import Timeline

router = APIRouter(prefix="/timeline", tags=["Timeline Engine"])


@router.get(
    "/health",
    summary="Timeline Engine health check",
)
async def timeline_health():
    return {
        "status": "ok",
        "service": "deterministic_timeline_engine",
        "components": ["timestamp_normalizer", "timeline_deduplicator", "timeline_engine"],
        "llm_used": False,
    }


@router.post(
    "",
    response_model=Timeline,
    status_code=status.HTTP_200_OK,
    summary="Build a chronologically ordered Timeline from an InvestigationContext",
    description=(
        "Ingests an InvestigationContext, deterministically parses and normalizes "
        "all timestamps to ISO-8601 UTC without using an LLM, deduplicates events, "
        "and returns a chronologically sorted Timeline object."
    ),
)
async def build_timeline(
    context: InvestigationContext,
    container: Container = Depends(get_di_container),
):
    try:
        timeline_engine = container.timeline_engine
        timeline = timeline_engine.build(context)
        return timeline
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Timeline generation failed: {exc}",
        )
