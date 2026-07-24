"""
Pydantic schemas for the Single Case Understanding Engine Output.
Validates the complete 9-section JSON response from the LLM.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


class Overview(BaseModel):
    complaint_summary: str = Field(description="Summary of the complaint text")
    incident_overview: str = Field(description="Comprehensive overview of the incident combining complaint and evidence")
    crime_category: str = Field(description="High-level category of crime")
    crime_subtype: str = Field(description="Specific sub-category of crime")
    priority: str = Field(default="medium", description="Priority level: low | medium | high | critical")
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)


class TimelineEvent(BaseModel):
    timestamp: str = Field(description="Timestamp or date/time indication")
    description: str = Field(description="Description of what happened at this point in time")
    supporting_evidence_ids: List[str] = Field(default_factory=list, description="IDs of supporting evidence files")
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)


class EntityItem(BaseModel):
    value: str = Field(description="Extracted value or name")
    source_evidence_ids: List[str] = Field(default_factory=list, description="IDs of evidence files referencing this entity")
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)

    @model_validator(mode="before")
    @classmethod
    def coerce_string_to_entity(cls, data: Any) -> Any:
        if isinstance(data, str):
            return {"value": data}
        return data


class PeopleAndEntities(BaseModel):
    victims: List[EntityItem] = Field(default_factory=list)
    suspects: List[EntityItem] = Field(default_factory=list)
    witnesses: List[EntityItem] = Field(default_factory=list)
    other_persons: List[EntityItem] = Field(default_factory=list)
    organizations: List[EntityItem] = Field(default_factory=list)
    locations: List[EntityItem] = Field(default_factory=list)
    vehicles: List[EntityItem] = Field(default_factory=list)
    phone_numbers: List[EntityItem] = Field(default_factory=list)
    emails: List[EntityItem] = Field(default_factory=list)
    upi_ids: List[EntityItem] = Field(default_factory=list)
    bank_accounts: List[EntityItem] = Field(default_factory=list)
    documents: List[EntityItem] = Field(default_factory=list)
    money: List[EntityItem] = Field(default_factory=list)
    digital_assets: List[EntityItem] = Field(default_factory=list)
    physical_assets: List[EntityItem] = Field(default_factory=list)


class EvidenceAnalysisItem(BaseModel):
    evidence_id: str = Field(description="ID of the analyzed evidence file")
    filename: str = Field(description="Filename of the evidence")
    summary: str = Field(description="Summary of findings in this evidence item")
    extracted_information: str = Field(description="Detailed facts extracted from this evidence item")
    importance: str = Field(default="medium", description="Importance level: low | medium | high | critical")
    allegations_supported: List[str] = Field(default_factory=list, description="Complaint allegations supported by this evidence")
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)


class EvidenceCorrelationItem(BaseModel):
    allegation: str = Field(description="Specific claim or allegation from the complaint")
    supporting_evidence_ids: List[str] = Field(default_factory=list, description="Evidence IDs corroborating this allegation")
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)
    contradicts_claim: bool = Field(default=False, description="True if evidence contradicts the claim")
    explanation: Optional[str] = Field(default=None, description="Explanation of correlation or contradiction")


class CrimeAnalysis(BaseModel):
    crime_category: str = Field(default="Uncategorized", description="High-level category of crime")
    crime_subtype: Optional[str] = Field(default=None, description="Subtype of crime")
    modus_operandi: str = Field(default="Under investigation", description="Observed method/pattern of operation based solely on evidence")
    estimated_financial_loss: Optional[float] = Field(default=None, description="Estimated total financial loss in INR/currency")
    digital_assets_involved: List[str] = Field(default_factory=list)
    physical_assets_involved: List[str] = Field(default_factory=list)


class ContradictionItem(BaseModel):
    description: str = Field(description="Description of conflicting statement, timestamp, or evidence")
    involved_evidence_ids: List[str] = Field(default_factory=list)
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)


class MissingInfoItem(BaseModel):
    item: str = Field(description="Information item absent from complaint (e.g. Transaction ID)")
    reason: str = Field(description="Why this information is required or relevant")
    importance: str = Field(default="medium", description="Importance level: low | medium | high")


class MissingEvidenceItem(BaseModel):
    evidence_name: str = Field(description="Type of evidence that would corroborate the case (e.g. Bank Statement)")
    reason_relevant: str = Field(default="Required for corroboration", description="Why this evidence is needed")
    related_allegation: str = Field(default="General allegation", description="The specific allegation it would corroborate")
    importance: str = Field(default="medium", description="Importance level: low | medium | high")


class CaseUnderstanding(BaseModel):
    """
    Master Case Understanding schema — contains all 9 required sections.
    """
    case_id: str = Field(description="Unique case identifier")
    overview: Overview
    timeline: List[TimelineEvent] = Field(default_factory=list)
    people_and_entities: PeopleAndEntities = Field(default_factory=PeopleAndEntities)
    evidence_analysis: List[EvidenceAnalysisItem] = Field(default_factory=list)
    evidence_correlation: List[EvidenceCorrelationItem] = Field(default_factory=list)
    crime_analysis: CrimeAnalysis = Field(default_factory=CrimeAnalysis)
    contradictions: List[ContradictionItem] = Field(default_factory=list)
    missing_information: List[MissingInfoItem] = Field(default_factory=list)
    missing_evidence: List[MissingEvidenceItem] = Field(default_factory=list)
    original_complaint: Optional[str] = Field(default=None, description="Original complaint text")
    processing_duration_ms: Optional[float] = Field(default=None, description="Pipeline processing duration in milliseconds")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @model_validator(mode="before")
    @classmethod
    def alias_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "crime_analysis" not in data or not data.get("crime_analysis"):
                data["crime_analysis"] = data.get("crime_details") or data.get("crime") or data.get("crime_summary") or {}
            if "overview" not in data or not data.get("overview"):
                data["overview"] = data.get("summary") or {}
        return data
