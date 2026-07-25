"""
Pydantic schemas for ComplaintProfile and EvidenceProfile.
Separates immutable original complaint representations and independent per-evidence profiles.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


class ComplaintProfile(BaseModel):
    """
    Immutable representation of a filed complaint.
    Processed exactly once at complaint registration time.
    """
    case_id: str = Field(default_factory=lambda: str(uuid4()))
    complaint_number: Optional[str] = None
    original_text: str = Field(..., description="Original complaint text as submitted by complainant")
    translated_text: Optional[str] = Field(default=None, description="English translation if original text was non-English")
    detected_language: str = Field(default="en", description="Language code detected (e.g. 'en', 'gu', 'hi')")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadata such as category, incident date, victim info")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def final_text(self) -> str:
        """Return English translated text if available, otherwise original text."""
        if self.translated_text and self.translated_text != self.original_text:
            return (
                f"ORIGINAL COMPLAINT ({self.detected_language}):\n{self.original_text}\n\n"
                f"ENGLISH TRANSLATION:\n{self.translated_text}"
            )
        return self.original_text


class EvidenceProfile(BaseModel):
    """
    Permanent representation of a single processed evidence item.
    Processed exactly once by its corresponding media worker (Image, Video, Audio, PDF, Document).
    """
    evidence_id: str = Field(default_factory=lambda: str(uuid4()))
    case_id: str = Field(..., description="Foreign key linking to ComplaintProfile case_id")
    filename: str = Field(..., description="Original filename of the evidence file")
    media_type: str = Field(..., description="Media category: image, audio, video, pdf, document")
    url: Optional[str] = Field(default=None, description="Cloudinary or storage URL")
    
    # Processed representations from deterministic media workers
    florence_description: Optional[str] = Field(default=None, description="Visual description from Florence-2 captioner")
    ocr_text: Optional[str] = Field(default=None, description="Extracted & translated OCR text from PaddleOCR")
    transcript: Optional[str] = Field(default=None, description="Audio/Video speech transcript from Whisper")
    pdf_text: Optional[str] = Field(default=None, description="Directly extracted text from digital PDF/Document")
    
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Technical metadata: size_bytes, duration, mime_type, resolution")
    processed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
