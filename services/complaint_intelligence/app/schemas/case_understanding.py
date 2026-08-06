"""
Pydantic schemas for the Single Case Understanding Engine Output.
Validates the clean 5-section JSON response from the LLM.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


class CaseUnderstandingOverview(BaseModel):
    complaint_summary: str = Field(default="", description="A concise summary of the complaint")
    incident_overview: str = Field(default="", description="Unified understanding of the incident by correlating complaint with evidence")
    crime_category: str = Field(default="Uncategorized", description="High-level category of crime")
    crime_subtype: str = Field(default="General", description="Specific sub-category of crime")
    priority: str = Field(default="medium", description="Priority level: low | medium | high | critical")
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)


# Backward compatibility alias
Overview = CaseUnderstandingOverview


class TimelineEvent(BaseModel):
    timestamp: str = Field(default="Unknown", description="Timestamp or date/time indication")
    description: str = Field(default="", description="Description of what happened at this point in time")
    supporting_evidence_ids: List[str] = Field(default_factory=list, description="IDs of supporting evidence files")
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)

    @model_validator(mode="before")
    @classmethod
    def coerce_nulls(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("timestamp"):
                data["timestamp"] = "Unknown"
            if not data.get("description"):
                data["description"] = ""
        return data


class EvidenceIntelligenceItem(BaseModel):
    evidence_id: str = Field(default="", description="Exact ID of the analyzed evidence file")
    filename: str = Field(default="", description="Filename of the evidence")
    caption: str = Field(default="", description="5-10 word title/caption describing the evidence")
    summary: str = Field(default="", description="Maximum two short sentences explaining contribution")
    supports: List[str] = Field(default_factory=list, description="Complaint allegations supported by this evidence")
    importance: str = Field(default="medium", description="Importance level: low | medium | high | critical")
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)

    @model_validator(mode="before")
    @classmethod
    def coerce_analysis_item(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "allegations_supported" in data and "supports" not in data:
                data["supports"] = data["allegations_supported"]
            if "extracted_information" in data and "caption" not in data:
                data["caption"] = data.get("summary", "")[:60]
        return data


# Backward compatibility alias
EvidenceAnalysisItem = EvidenceIntelligenceItem


class MissingInformationAndEvidenceItem(BaseModel):
    title: str = Field(default="", description="Missing detail or document title complainant can clarify/upload")
    description: str = Field(default="", description="Why this detail/item is requested from complainant")
    importance: str = Field(default="medium", description="Importance level: low | medium | high")

    @property
    def item(self) -> str:
        return self.title

    @property
    def reason(self) -> str:
        return self.description

    @property
    def evidence_name(self) -> str:
        return self.title

    @property
    def reason_relevant(self) -> str:
        return self.description

    @model_validator(mode="before")
    @classmethod
    def coerce_info_or_evidence_item(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "item" in data and "title" not in data:
                data["title"] = data["item"]
            if "evidence_name" in data and "title" not in data:
                data["title"] = data["evidence_name"]
            if "reason" in data and "description" not in data:
                data["description"] = data["reason"]
            if "reason_relevant" in data and "description" not in data:
                data["description"] = data["reason_relevant"]
        return data


# Backward compatibility aliases
MissingInfoItem = MissingInformationAndEvidenceItem
MissingEvidenceItem = MissingInformationAndEvidenceItem


class ContradictionItem(BaseModel):
    description: str = Field(description="Description of conflicting statement between complaint and evidence")
    related_evidence_ids: List[str] = Field(default_factory=list, description="IDs of evidence involved")
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)

    @model_validator(mode="before")
    @classmethod
    def coerce_involved_ids(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "involved_evidence_ids" in data and "related_evidence_ids" not in data:
                data["related_evidence_ids"] = data["involved_evidence_ids"]
        return data


# Legacy compatibility classes
class EntityItem(BaseModel):
    value: str = Field(default="")
    source_evidence_ids: List[str] = Field(default_factory=list)
    confidence: float = Field(default=0.9)


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


class EvidenceCorrelationItem(BaseModel):
    allegation: str = Field(default="")
    supporting_evidence_ids: List[str] = Field(default_factory=list)
    confidence: float = Field(default=0.9)
    contradicts_claim: bool = Field(default=False)
    explanation: Optional[str] = Field(default=None)


class CrimeAnalysis(BaseModel):
    crime_category: str = Field(default="Uncategorized")
    crime_subtype: Optional[str] = Field(default=None)
    modus_operandi: str = Field(default="")
    estimated_financial_loss: Optional[float] = Field(default=None)
    digital_assets_involved: List[str] = Field(default_factory=list)
    physical_assets_involved: List[str] = Field(default_factory=list)


class CaseUnderstanding(BaseModel):
    """
    Master Case Understanding schema — contains the clean 5 required sections.
    """
    case_id: str = Field(default="UNKNOWN", description="Unique case identifier")
    case_understanding: CaseUnderstandingOverview = Field(default_factory=CaseUnderstandingOverview)
    timeline: List[TimelineEvent] = Field(default_factory=list)
    evidence_intelligence: List[EvidenceIntelligenceItem] = Field(default_factory=list)
    missing_information_and_evidence: List[MissingInformationAndEvidenceItem] = Field(default_factory=list)
    contradictions: List[ContradictionItem] = Field(default_factory=list)

    # Legacy fields for backward compatibility
    people_and_entities: PeopleAndEntities = Field(default_factory=PeopleAndEntities)
    evidence_correlation: List[EvidenceCorrelationItem] = Field(default_factory=list)
    crime_analysis: CrimeAnalysis = Field(default_factory=CrimeAnalysis)

    # Optional metadata
    original_complaint: Optional[str] = Field(default=None, description="Original complaint text")
    processing_duration_ms: Optional[float] = Field(default=None, description="Pipeline processing duration in milliseconds")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def overview(self) -> CaseUnderstandingOverview:
        """Backward compatibility property mapping overview -> case_understanding."""
        return self.case_understanding

    @property
    def evidence_analysis(self) -> List[EvidenceIntelligenceItem]:
        """Backward compatibility property mapping evidence_analysis -> evidence_intelligence."""
        return self.evidence_intelligence

    @property
    def missing_information(self) -> List[MissingInformationAndEvidenceItem]:
        """Backward compatibility property."""
        return self.missing_information_and_evidence

    @property
    def missing_evidence(self) -> List[MissingInformationAndEvidenceItem]:
        """Backward compatibility property."""
        return self.missing_information_and_evidence

    @model_validator(mode="before")
    @classmethod
    def alias_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # Map legacy "overview" -> "case_understanding"
            if "case_understanding" not in data or not data.get("case_understanding"):
                if "overview" in data and isinstance(data["overview"], dict):
                    data["case_understanding"] = data["overview"]
                elif "summary" in data and isinstance(data["summary"], dict):
                    data["case_understanding"] = data["summary"]

            # Map legacy "evidence_analysis" -> "evidence_intelligence"
            if "evidence_intelligence" not in data or not data.get("evidence_intelligence"):
                if "evidence_analysis" in data and isinstance(data["evidence_analysis"], list):
                    data["evidence_intelligence"] = data["evidence_analysis"]

            # Map legacy "missing_information" / "missing_evidence" -> "missing_information_and_evidence"
            if "missing_information_and_evidence" not in data or not data.get("missing_information_and_evidence"):
                mi = data.get("missing_information") or []
                me = data.get("missing_evidence") or []
                combined = []
                for item in mi:
                    if isinstance(item, dict):
                        combined.append({
                            "title": item.get("item") or item.get("title", ""),
                            "description": item.get("reason") or item.get("description", ""),
                            "importance": item.get("importance", "medium"),
                        })
                for item in me:
                    if isinstance(item, dict):
                        combined.append({
                            "title": item.get("evidence_name") or item.get("title", ""),
                            "description": item.get("reason_relevant") or item.get("description", ""),
                            "importance": item.get("importance", "medium"),
                        })
                if combined:
                    data["missing_information_and_evidence"] = combined
        return data
