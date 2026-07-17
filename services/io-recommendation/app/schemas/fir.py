"""
Pydantic v2 schemas for the /embed-case endpoint.
Represents a completely closed FIR sent by the Node backend.
"""
from pydantic import BaseModel, Field
from typing import Optional, List


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


class EmbedCaseResponse(BaseModel):
    success: bool
    firId: str
    message: str
    action: str = Field(..., description="'created' or 'updated'")
