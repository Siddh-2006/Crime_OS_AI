"""
Pydantic v2 schemas for the /embed-case endpoint.
Represents a completely closed FIR sent by the Node backend.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class ComplaintIntelligenceData(BaseModel):
    crimeType: Optional[str] = Field(None, description="LLM-derived crime type/category")
    priority: Optional[str] = Field(None, description="LLM-derived priority")
    confidence: Optional[float] = Field(None, description="LLM confidence score")
    summary: Optional[str] = Field(None, description="AI summary of the complaint")
    missingInformation: Optional[List[str]] = Field(default_factory=list, description="Missing information items")
    recommendations: Optional[List[str]] = Field(default_factory=list, description="AI recommendations")


class DiaryEntryData(BaseModel):
    timestamp: Optional[str] = Field(None, description="ISO timestamp of the diary event")
    actorType: Optional[str] = Field(None, description="Actor type: officer/system/department")
    actorId: Optional[str] = Field(None, description="Actor ObjectId")
    eventType: Optional[str] = Field(None, description="Diary event type")
    summary: Optional[str] = Field(None, description="Short summary of the diary entry")
    payload: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Optional event payload")


class CaseChecklistItem(BaseModel):
    stepId: Optional[str] = Field(None, description="Checklist step identifier")
    title: Optional[str] = Field(None, description="Checklist step title")
    status: Optional[str] = Field(None, description="Step status")
    criticality: Optional[str] = Field(None, description="Step criticality")
    requiredEvidence: Optional[List[str]] = Field(default_factory=list, description="Evidence required for this step")
    proofEvidenceIds: Optional[List[str]] = Field(default_factory=list, description="Evidence IDs that prove completion")


class CaseEntityData(BaseModel):
    entityType: Optional[str] = Field(None, description="Type of entity, e.g. phone, bank_account")
    value: Optional[str] = Field(None, description="Entity value")
    firstSeenEntryId: Optional[str] = Field(None, description="Diary entry where the entity first appeared")
    corroboratingEvidenceIds: Optional[List[str]] = Field(default_factory=list, description="Evidence IDs that corroborate this entity")


class AnalysisSnapshotData(BaseModel):
    snapshotId: Optional[str] = Field(None, description="Snapshot identifier")
    timestamp: Optional[str] = Field(None, description="ISO timestamp when snapshot was created")
    trigger: Optional[str] = Field(None, description="Trigger type")
    narrativeSummary: Optional[str] = Field(None, description="Snapshot narrative summary")
    confidenceBreakdown: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Confidence breakdown details")
    officerAuthored: Optional[bool] = Field(False, description="Whether the snapshot was officer-authored")
    rankedNextSteps: Optional[List[Dict[str, Any]]] = Field(default_factory=list, description="Ranked next-step recommendations")


class DepartmentRequestData(BaseModel):
    requestId: Optional[str] = Field(None, description="Department request identifier")
    stepId: Optional[str] = Field(None, description="Associated checklist step")
    departmentEntityId: Optional[str] = Field(None, description="Department entity identifier")
    status: Optional[str] = Field(None, description="Current request status")
    draftContent: Optional[str] = Field(None, description="Draft request content")
    sentVia: Optional[str] = Field(None, description="Sent via channel")
    sentAt: Optional[str] = Field(None, description="ISO timestamp when request was sent")
    responseAt: Optional[str] = Field(None, description="ISO timestamp when response was received")


class ChargeSheetEntry(BaseModel):
    section: Optional[str] = Field(None, description="Legal section applied")
    offense: Optional[str] = Field(None, description="Offense description")
    count: Optional[int] = Field(None, description="Number of charges")


class EmbedCaseRequest(BaseModel):
    """
    Payload sent by the Node backend after a case is closed.
    IDs are stored only in payload — never embedded in the text vector.
    """

    # ── Metadata (stored as Qdrant payload, not embedded) ──────────────────────
    firId: str = Field(..., description="MongoDB ObjectId of the FIR/complaint document")
    complaintId: str = Field(..., description="Complaint ObjectId (may equal firId if same doc)")
    officerId: str = Field(..., description="ObjectId of the IO who handled the case")
    stationId: str = Field(..., description="ObjectId of the police station")
    district: str = Field(..., description="District name, e.g. 'Ahmedabad'")
    firNumber: str = Field(..., description="Human-readable FIR number, e.g. GJ-AHM002-2026-0001")
    status: str = Field(default="CLOSED", description="Must be CLOSED for embedding")
    closedDate: Optional[str] = Field(None, description="ISO date string when case was closed")
    createdAt: str = Field(..., description="ISO date string when complaint was created")

    # ── Semantic content (converted to structured text and embedded) ────────────
    crimeCategory: str = Field(..., description="Primary crime category, e.g. THEFT")
    crimeSubCategory: Optional[str] = Field(None, description="Sub-category if applicable")
    incidentSummary: str = Field(..., description="Brief narrative of what happened")
    modusOperandi: Optional[str] = Field(None, description="How the crime was carried out")
    evidenceSummary: Optional[str] = Field(None, description="Summary of evidence collected")
    investigationSummary: Optional[str] = Field(None, description="Summary of how investigation progressed")
    sections: Optional[List[str]] = Field(default_factory=list, description="IPC/BNS sections applied")
    location: str = Field(..., description="Place of occurrence, including district/state")
    complaintIntelligence: Optional[ComplaintIntelligenceData] = Field(
        None,
        description="Optional AI-generated complaint intelligence summary and recommendations",
    )
    diaryEntries: List[DiaryEntryData] = Field(default_factory=list, description="Case diary history")
    caseChecklist: List[CaseChecklistItem] = Field(default_factory=list, description="Checklist items for the case")
    caseEntities: List[CaseEntityData] = Field(default_factory=list, description="Extracted case entities")
    analysisSnapshots: List[AnalysisSnapshotData] = Field(default_factory=list, description="Investigation snapshots")
    departmentRequests: List[DepartmentRequestData] = Field(default_factory=list, description="Department requests associated with this case")
    chargeSheet: List[ChargeSheetEntry] = Field(default_factory=list, description="Applied chargesheet entries")


class EmbedCaseResponse(BaseModel):
    success: bool
    firId: str
    message: str
    action: str = Field(..., description="'created' or 'updated'")
