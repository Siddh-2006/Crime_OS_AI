"""
Pydantic v2 schemas for the /recommend-officers endpoint.
"""
from typing import Any, Optional, List

from pydantic import BaseModel, ConfigDict, Field, model_validator


class OfficerInfo(BaseModel):
    """Minimal officer info supplied by Node backend for filtering recommendations."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    officerId: str = Field(..., description="MongoDB ObjectId of the officer")
    officerName: Optional[str] = Field(None, description="Human-readable name (for context only)")
    badgeNumber: Optional[str] = Field(None, description="Badge number (for context only)")


class ComplaintData(BaseModel):
    """
    Current (open) complaint data sent by the Node backend.
    The AI service normalises this into structured text and finds
    semantically similar closed cases to recommend an IO.
    """

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    complaintId: str = Field(..., description="MongoDB ObjectId of this complaint")
    stationId: str = Field(..., description="ObjectId of the police station handling this complaint")
    category: str = Field(default="", description="Crime category, e.g. THEFT")
    subCategory: Optional[str] = Field(default=None, description="Sub-category if applicable")
    shortDescription: str = Field(default="", description="One-line summary of the crime")
    detailedDescription: str = Field(default="", description="Full narrative of the incident")
    incidentPlace: str = Field(default="", description="Place of occurrence")
    incidentDate: str = Field(default="", description="ISO date of incident")
    incidentTime: Optional[str] = Field(None, description="Optional time of incident")
    address: Optional[str] = Field(None, description="Optional address or locality")
    approximateDateText: Optional[str] = Field(None, description="Optional human-readable date description")
    evidenceSummary: Optional[str] = Field(
        None,
        description="Optional comma-separated list of evidence types submitted by citizen",
    )
    complaintIntelligenceSummary: Optional[str] = Field(
        None,
        description="Optional AI-generated complaint summary from the newer complaint schema",
    )
    crimeSummary: Optional[str] = Field(None, description="Optional latest crime summary history entry")
    legalSections: Optional[str] = Field(None, description="Optional latest legal sections history entry")
    investigationNotes: Optional[str] = Field(None, description="Optional latest investigation notes history entry")

    @model_validator(mode="before")
    @classmethod
    def normalize_legacy_fields(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value

        data = dict(value)

        if "crimeCategory" in data and "category" not in data:
            data["category"] = data["crimeCategory"]
        if "sub_category" in data and "subCategory" not in data:
            data["subCategory"] = data["sub_category"]
        if "short_description" in data and "shortDescription" not in data:
            data["shortDescription"] = data["short_description"]
        if "detailed_description" in data and "detailedDescription" not in data:
            data["detailedDescription"] = data["detailed_description"]
        if "incident_place" in data and "incidentPlace" not in data:
            data["incidentPlace"] = data["incident_place"]
        if "incident_date" in data and "incidentDate" not in data:
            data["incidentDate"] = data["incident_date"]

        if "complaint_intelligence" in data and "complaintIntelligenceSummary" not in data:
            complaint_intelligence = data["complaint_intelligence"]
            if isinstance(complaint_intelligence, dict):
                data["complaintIntelligenceSummary"] = complaint_intelligence.get("summary")

        for history_key, summary_key in (
            ("crimeSummaryHistory", "crimeSummary"),
            ("legalSectionsHistory", "legalSections"),
            ("investigationNotesHistory", "investigationNotes"),
        ):
            if history_key in data and summary_key not in data:
                history_items = data[history_key]
                if isinstance(history_items, list) and history_items:
                    last_item = history_items[-1]
                    if isinstance(last_item, dict):
                        data[summary_key] = last_item.get("content")

        return data


class RecommendOfficersRequest(BaseModel):
    """Full request body for the /recommend-officers endpoint."""

    complaint: ComplaintData
    availableOfficers: List[OfficerInfo] = Field(
        ...,
        description="List of IOs belonging to the complaint's police station",
    )
