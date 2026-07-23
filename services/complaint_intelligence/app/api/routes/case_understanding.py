"""
FastAPI router for Case Understanding Engine.
Provides endpoints for single-pass analysis and section-by-section frontend retrieval.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple
from fastapi import APIRouter, Depends, Form, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.case_understanding.pipeline_orchestrator import CasePipelineOrchestrator
from app.core.container import Container, get_container
from app.schemas.case_context import CaseContext, EvidenceItem
from app.schemas.case_understanding import (
    CaseUnderstanding,
    ContradictionItem,
    CrimeAnalysis,
    EvidenceAnalysisItem,
    EvidenceCorrelationItem,
    MissingEvidenceItem,
    MissingInfoItem,
    Overview,
    PeopleAndEntities,
    TimelineEvent,
)

router = APIRouter(prefix="/case-understanding", tags=["Case Understanding Engine"])


class AnalyzeCaseRequest(BaseModel):
    """Payload for analyzing a case with pre-extracted textual evidence items."""
    complaint_text: str = Field(description="Original complaint text")
    case_id: Optional[str] = Field(default=None, description="Optional custom case ID")
    complaint_metadata: Dict[str, Any] = Field(default_factory=dict)
    evidence: List[EvidenceItem] = Field(default_factory=list, description="Extracted textual evidence representations")


@router.post(
    "/submit-case",
    response_model=CaseUnderstanding,
    status_code=status.HTTP_200_OK,
    summary="Submit complaint with evidence files for full end-to-end processing",
    description=(
        "Upload complaint text and raw evidence files (images, audio, video, PDF, text). "
        "Runs deterministic media extractors in parallel (Florence-2, PaddleOCR, Whisper, PDF), "
        "builds CaseContext, executes the Single-Pass Case Understanding LLM Engine, "
        "saves to MongoDB, and returns the 9-section Case Understanding JSON."
    ),
)
async def submit_case(
    complaint_text: str = Form(...),
    case_id: Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[]),
    container: Container = Depends(get_container),
) -> CaseUnderstanding:
    if not complaint_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complaint text cannot be empty.",
        )

    file_tuples: List[Tuple[str, str, bytes]] = []
    for f in files:
        if f.filename:
            content = await f.read()
            if content:
                file_tuples.append((f.filename, f.content_type or "", content))

    orchestrator = CasePipelineOrchestrator(container=container)
    try:
        case_understanding = await orchestrator.process_case(
            complaint_text=complaint_text,
            files=file_tuples,
            case_id=case_id,
        )
        return case_understanding
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Case submission processing failed: {exc}",
        ) from exc


@router.post(
    "/analyze",
    response_model=CaseUnderstanding,
    status_code=status.HTTP_200_OK,
    summary="Analyze a case in a single LLM pass",
    description=(
        "Receives complaint text and evidence extractions, constructs a CaseContext, "
        "runs the Single-Pass Case Understanding Engine, persists to MongoDB, "
        "and returns the complete 9-section Case Understanding JSON."
    ),
)
async def analyze_case(
    req: AnalyzeCaseRequest,
    container: Container = Depends(get_container),
) -> CaseUnderstanding:
    if not req.complaint_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complaint text cannot be empty.",
        )

    context = container.case_context_builder.build(
        complaint_text=req.complaint_text,
        evidence_items=req.evidence,
        case_id=req.case_id,
        complaint_metadata=req.complaint_metadata,
    )

    try:
        case_understanding = await container.case_understanding_engine.analyze(context)
        await container.case_repository.save(case_understanding)
        return case_understanding
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Case understanding analysis failed: {exc}",
        ) from exc


@router.get(
    "/{case_id}",
    response_model=CaseUnderstanding,
    summary="Get complete Case Understanding JSON by Case ID",
)
async def get_case(
    case_id: str,
    container: Container = Depends(get_container),
) -> CaseUnderstanding:
    case = await container.case_repository.get_by_id(case_id)
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with ID '{case_id}' not found.",
        )
    return case


@router.get("/{case_id}/overview", response_model=Overview)
async def get_case_overview(case_id: str, container: Container = Depends(get_container)) -> Overview:
    case = await get_case(case_id, container)
    return case.overview


@router.get("/{case_id}/timeline", response_model=List[TimelineEvent])
async def get_case_timeline(case_id: str, container: Container = Depends(get_container)) -> List[TimelineEvent]:
    case = await get_case(case_id, container)
    return case.timeline


@router.get("/{case_id}/entities", response_model=PeopleAndEntities)
async def get_case_entities(case_id: str, container: Container = Depends(get_container)) -> PeopleAndEntities:
    case = await get_case(case_id, container)
    return case.people_and_entities


@router.get("/{case_id}/evidence", response_model=List[EvidenceAnalysisItem])
async def get_case_evidence_analysis(case_id: str, container: Container = Depends(get_container)) -> List[EvidenceAnalysisItem]:
    case = await get_case(case_id, container)
    return case.evidence_analysis


@router.get("/{case_id}/evidence-correlation", response_model=List[EvidenceCorrelationItem])
async def get_case_evidence_correlation(case_id: str, container: Container = Depends(get_container)) -> List[EvidenceCorrelationItem]:
    case = await get_case(case_id, container)
    return case.evidence_correlation


@router.get("/{case_id}/crime-analysis", response_model=CrimeAnalysis)
async def get_case_crime_analysis(case_id: str, container: Container = Depends(get_container)) -> CrimeAnalysis:
    case = await get_case(case_id, container)
    return case.crime_analysis


@router.get("/{case_id}/contradictions", response_model=List[ContradictionItem])
async def get_case_contradictions(case_id: str, container: Container = Depends(get_container)) -> List[ContradictionItem]:
    case = await get_case(case_id, container)
    return case.contradictions


@router.get("/{case_id}/missing-information", response_model=List[MissingInfoItem])
async def get_case_missing_information(case_id: str, container: Container = Depends(get_container)) -> List[MissingInfoItem]:
    case = await get_case(case_id, container)
    return case.missing_information


@router.get("/{case_id}/missing-evidence", response_model=List[MissingEvidenceItem])
async def get_case_missing_evidence(case_id: str, container: Container = Depends(get_container)) -> List[MissingEvidenceItem]:
    case = await get_case(case_id, container)
    return case.missing_evidence
