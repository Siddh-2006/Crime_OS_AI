"""
Pydantic schema for Case Context.
Combines complaint details and all textual evidence representations
into a single input structure for the Case Understanding Engine.
"""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


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


class CaseContext(BaseModel):
    """Unified context passed into the Single LLM Call."""
    case_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    complaint_text: str
    complaint_metadata: Dict[str, Any] = Field(default_factory=dict)
    evidence: List[EvidenceItem] = Field(default_factory=list)
