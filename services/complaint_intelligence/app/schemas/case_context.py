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
from app.llm.compression_client import PromptCompressionClient


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
        complaint: ComplaintProfile | str,
        evidence_profiles: List[EvidenceProfile],
    ) -> CaseContext:
        """Construct CaseContext directly from ComplaintProfile/text and EvidenceProfiles."""
        items = [EvidenceItem.from_profile(ep) for ep in evidence_profiles]
        if isinstance(complaint, str):
            return cls(
                case_id=str(uuid.uuid4()),
                complaint_text=complaint,
                evidence=items,
            )
        return cls(
            case_id=complaint.case_id,
            complaint_text=complaint.final_text,
            complaint_metadata=complaint.metadata,
            evidence=items,
        )

    @classmethod
    def build_direct(
        cls,
        case_id: str,
        complaint_text: str,
        evidence_profiles: List[EvidenceProfile],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> CaseContext:
        """Directly construct CaseContext without needing a DB-persisted ComplaintProfile."""
        items = [EvidenceItem.from_profile(ep) for ep in evidence_profiles]
        return cls(
            case_id=case_id,
            complaint_text=complaint_text,
            complaint_metadata=metadata or {},
            evidence=items,
        )



    async def compress_context(self, client: PromptCompressionClient) -> None:
        if len(self.complaint_text or "") > 2000:
            force_tokens = client.extract_force_tokens(self.complaint_text)
            self.complaint_text = await client.compress(self.complaint_text, force_tokens)
        
        for ev in self.evidence:
            if ev.florence_description and len(ev.florence_description) > 2000:
                ev.florence_description = await client.compress(ev.florence_description, client.extract_force_tokens(ev.florence_description))
            if ev.ocr_text and len(ev.ocr_text) > 2000:
                ev.ocr_text = await client.compress(ev.ocr_text, client.extract_force_tokens(ev.ocr_text))
            if ev.transcript and len(ev.transcript) > 2000:
                ev.transcript = await client.compress(ev.transcript, client.extract_force_tokens(ev.transcript))
            if ev.pdf_text and len(ev.pdf_text) > 2000:
                ev.pdf_text = await client.compress(ev.pdf_text, client.extract_force_tokens(ev.pdf_text))
