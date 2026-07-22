"""
M11 Timeline Intelligence Engine — REST API.

GET  /timeline-intelligence/health — health check
POST /timeline-intelligence        — analyze a deterministic timeline with LLM
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_di_container
from app.core.container import Container
from app.schemas.timeline_intelligence import TimelineIntelligence, TimelineIntelligenceInput

router = APIRouter(prefix="/timeline-intelligence", tags=["Timeline Intelligence"])


@router.get(
    "/health",
    summary="Timeline Intelligence Engine health check",
)
async def timeline_intelligence_health():
    return {
        "status": "ok",
        "service": "timeline_intelligence_engine",
        "components": ["prompt_builder", "llm_client", "timeline_intelligence_engine"],
        "llm_used": True,
        "model": "gemma4:e2b (via ILLMClient)",
    }


@router.post(
    "",
    response_model=TimelineIntelligence,
    status_code=status.HTTP_200_OK,
    summary="Analyze a deterministic Timeline with LLM-guided intelligence",
    description=(
        "Accepts a ComplaintProfile, a deterministic Timeline (M10), and EvidenceRefs. "
        "Uses gemma4:e2b via ILLMClient to improve wording, resolve actor references, "
        "detect contradictions, infer causal relationships, and flag missing timestamps. "
        "Strict anti-hallucination: the LLM may not introduce any person, place, "
        "timestamp, or event not present in the provided input."
    ),
)
async def analyze_timeline_intelligence(
    payload: TimelineIntelligenceInput,
    container: Container = Depends(get_di_container),
) -> TimelineIntelligence:
    try:
        engine = container.timeline_intelligence_engine
        result = await engine.analyze(payload)
        return result
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Timeline Intelligence analysis failed: {exc}",
        )
