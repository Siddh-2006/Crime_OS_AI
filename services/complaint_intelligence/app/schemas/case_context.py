"""
Pydantic schema for Case Context.
Combines complaint details and all textual evidence representations
into a single input structure for the Case Understanding Engine.
"""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.schemas.case_profile import ComplaintProfile, EvidenceProfile


class EvidenceItem(BaseModel):
    """Textual representation of an uploaded evidence artifact."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    type: str  # "image" | "audio" | "video" | "pdf" | "document" | "other"
    florence_description: Optional[str] = None
    ocr_text: Optional[str] = None
    transcript: Optional[str] = None
    pdf_text: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_profile(cls, profile: EvidenceProfile) -> EvidenceItem:
        """Convert a permanent EvidenceProfile into a CaseContext EvidenceItem."""
        return cls(
            id=profile.evidence_id,
            filename=profile.filename,
            type=profile.media_type,
            florence_description=profile.florence_description,
            ocr_text=profile.ocr_text,
            transcript=profile.transcript,
            pdf_text=profile.pdf_text,
            metadata=profile.metadata,
        )


class CaseContext(BaseModel):
    """Unified context passed into the Single LLM Call."""
    case_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    complaint_text: str
    complaint_metadata: Dict[str, Any] = Field(default_factory=dict)
    evidence: List[EvidenceItem] = Field(default_factory=list)

    @classmethod
    def from_profiles(
        cls,
        complaint: ComplaintProfile,
        evidence_profiles: List[EvidenceProfile],
    ) -> CaseContext:
        """Construct CaseContext directly from stored ComplaintProfile and EvidenceProfiles."""
        items = [EvidenceItem.from_profile(ep) for ep in evidence_profiles]
        return cls(
            case_id=complaint.case_id,
            complaint_text=complaint.final_text,
            complaint_metadata=complaint.metadata,
            evidence=items,
        )
