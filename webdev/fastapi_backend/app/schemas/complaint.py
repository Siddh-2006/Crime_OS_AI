"""
Pydantic v2 schemas for the /recommend-officers endpoint.
"""
from pydantic import BaseModel, Field
from typing import Optional, List


class OfficerInfo(BaseModel):
    """Minimal officer info supplied by Node backend for filtering recommendations."""

    officerId: str = Field(..., description="MongoDB ObjectId of the officer")
    officerName: Optional[str] = Field(None, description="Human-readable name (for context only)")
    badgeNumber: Optional[str] = Field(None, description="Badge number (for context only)")


class ComplaintData(BaseModel):
    """
    Current (open) complaint data sent by the Node backend.
    The AI service normalises this into structured text and finds
    semantically similar closed cases to recommend an IO.
    """

    complaintId: str = Field(..., description="MongoDB ObjectId of this complaint")
    stationId: str = Field(..., description="ObjectId of the police station handling this complaint")
    category: str = Field(..., description="Crime category, e.g. THEFT")
    subCategory: Optional[str] = Field(None, description="Sub-category if applicable")
    shortDescription: str = Field(..., description="One-line summary of the crime")
    detailedDescription: str = Field(..., description="Full narrative of the incident")
    incidentPlace: str = Field(..., description="Place of occurrence")
    incidentDate: str = Field(..., description="ISO date of incident")
    evidenceSummary: Optional[str] = Field(
        None,
        description="Optional comma-separated list of evidence types submitted by citizen",
    )


class RecommendOfficersRequest(BaseModel):
    """Full request body for the /recommend-officers endpoint."""

    complaint: ComplaintData
    availableOfficers: List[OfficerInfo] = Field(
        ...,
        description="List of IOs belonging to the complaint's police station",
    )
