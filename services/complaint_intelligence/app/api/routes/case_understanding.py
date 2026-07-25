"""
FastAPI router for Case Understanding Engine & Incremental Evidence Processing.
Provides endpoints for complaint registration, incremental evidence upload,
single-pass analysis, and section-by-section frontend retrieval.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple
from fastapi import APIRouter, Depends, Form, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.case_understanding.incremental_orchestrator import IncrementalPipelineOrchestrator
from app.case_understanding.pipeline_orchestrator import CasePipelineOrchestrator
from app.core.container import Container, get_container
from app.schemas.case_context import CaseContext, EvidenceItem
from app.schemas.case_profile import ComplaintProfile, EvidenceProfile
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


class RegisterComplaintRequest(BaseModel):
    """Payload for registering a complaint once into an immutable ComplaintProfile."""
    case_id: str = Field(description="Unique Case ID")
    complaint_text: str = Field(description="Original complaint text as submitted by complainant")
    complaint_number: Optional[str] = Field(default=None, description="Complaint tracking number")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadata such as category, date, complainant info")


class AnalyzeCaseRequest(BaseModel):
    """Payload for analyzing a case with pre-extracted textual evidence items."""
    complaint_text: str = Field(description="Original complaint text")
    case_id: Optional[str] = Field(default=None, description="Optional custom case ID")
    complaint_metadata: Dict[str, Any] = Field(default_factory=dict)
    evidence: List[EvidenceItem] = Field(default_factory=list, description="Extracted textual evidence representations")


# ─── 1. INCREMENTAL COMPLAINT REGISTRATION ───────────────────────────────────

@router.post(
    "/register-complaint",
    status_code=status.HTTP_201_CREATED,
    summary="Register a new complaint once into an immutable ComplaintProfile",
    description="Processes original complaint text, translates if needed, creates immutable ComplaintProfile, and initializes living CaseIntelligence.",
)
async def register_complaint(
    req: RegisterComplaintRequest,
    container: Container = Depends(get_container),
) -> Dict[str, Any]:
    if not req.complaint_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complaint text cannot be empty.",
        )

    orchestrator = container.incremental_pipeline_orchestrator
    try:
        profile, case_understanding = await orchestrator.register_complaint(
            case_id=req.case_id,
            complaint_text=req.complaint_text,
            complaint_number=req.complaint_number,
            metadata=req.metadata,
        )
        return {
            "status": "success",
            "message": "Complaint registered successfully",
            "complaint_profile": profile.model_dump(mode="json"),
            "case_intelligence": case_understanding.model_dump(mode="json"),
        }
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Complaint registration failed: {exc}",
        ) from exc


# ─── 2. INCREMENTAL EVIDENCE UPLOAD ──────────────────────────────────────────

@router.post(
    "/upload-evidence",
    status_code=status.HTTP_200_OK,
    summary="Upload single new evidence item for incremental processing",
    description=(
        "Processes ONLY the uploaded file through its specific worker (Image, Video, Audio, PDF) "
        "to generate a permanent EvidenceProfile. Then triggers living CaseIntelligence fusion "
        "using ComplaintProfile + ALL accumulated EvidenceProfiles. Existing workers are NOT re-run."
    ),
)
async def upload_evidence(
    case_id: str = Form(...),
    evidence_id: Optional[str] = Form(None),
    file: UploadFile = File(...),
    container: Container = Depends(get_container),
) -> Dict[str, Any]:
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a filename.",
        )

    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    orchestrator = container.incremental_pipeline_orchestrator
    try:
        ev_profile, case_understanding = await orchestrator.process_incremental_evidence(
            case_id=case_id,
            filename=file.filename,
            content_type=file.content_type or "",
            file_bytes=content,
            evidence_id=evidence_id,
        )
        return {
            "status": "success",
            "message": f"Evidence '{file.filename}' processed incrementally",
            "evidence_profile": ev_profile.model_dump(mode="json"),
            "case_intelligence": case_understanding.model_dump(mode="json"),
        }
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Incremental evidence processing failed: {exc}",
        ) from exc


# ─── 3. BATCH CASE SUBMISSION (Backwards Compatible) ──────────────────────────

@router.post(
    "/submit-case",
    response_model=CaseUnderstanding,
    status_code=status.HTTP_200_OK,
    summary="Submit complaint with evidence files for full end-to-end processing",
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


# ─── 4. PROFILES & INTELLIGENCE RETRIEVAL ─────────────────────────────────────

@router.get(
    "/{case_id}/profiles",
    summary="Get ComplaintProfile and all EvidenceProfiles for a case",
)
async def get_case_profiles(
    case_id: str,
    container: Container = Depends(get_container),
) -> Dict[str, Any]:
    c_profile = await container.complaint_profile_repository.get_by_case_id(case_id)
    ev_profiles = await container.evidence_profile_repository.get_all_for_case(case_id)
    
    return {
        "case_id": case_id,
        "complaint_profile": c_profile.model_dump(mode="json") if c_profile else None,
        "evidence_profiles": [ep.model_dump(mode="json") for ep in ev_profiles],
        "evidence_count": len(ev_profiles),
    }


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
