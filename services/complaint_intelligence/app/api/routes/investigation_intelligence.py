"""
M12 Investigation Intelligence Engine — REST API.

GET  /investigation-intelligence/health — health check
POST /investigation-intelligence        — generate structured InvestigationIntelligence
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_di_container
from app.core.container import Container
from app.schemas.investigation_intelligence import (
    InvestigationIntelligence,
    InvestigationIntelligenceInput,
)

router = APIRouter(prefix="/investigation-intelligence", tags=["Investigation Intelligence"])


@router.get(
    "/health",
    summary="Investigation Intelligence Engine health check",
)
async def investigation_intelligence_health():
    return {
        "status": "ok",
        "service": "investigation_intelligence_engine",
        "components": ["prompt_builder", "llm_client", "investigation_intelligence_engine"],
        "llm_used": True,
        "model": "gemma4:e2b (via ILLMClient)",
    }


@router.post(
    "",
    response_model=InvestigationIntelligence,
    status_code=status.HTTP_200_OK,
    summary="Build structured Investigation Intelligence from Complaint Profile, Evidence Profiles, and Timeline Intelligence",
    description=(
        "Transforms ComplaintProfile, EvidenceProfile list, and TimelineIntelligence (M11) "
        "into a structured, semantically enriched InvestigationIntelligence representation. "
        "Provides crime classification, entity correlation, contradiction detection, "
        "investigative gap identification, and risk assessment. "
        "Does NOT generate action plans, recommendations, or investigative decisions. "
        "Uses Gemma4 E2B via ILLMClient with strict anti-hallucination constraints. "
        "Falls back gracefully to deterministic intelligence on LLM error."
    ),
)
async def analyze_investigation_intelligence(
    payload: InvestigationIntelligenceInput,
    container: Container = Depends(get_di_container),
) -> InvestigationIntelligence:
    try:
        engine = container.investigation_intelligence_engine
        result = await engine.analyze(payload)
        return result
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Investigation Intelligence analysis failed: {exc}",
        )
