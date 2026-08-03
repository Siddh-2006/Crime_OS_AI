"""
Pydantic schemas for ComplaintProfile and EvidenceProfile.
Separates immutable original complaint representations and independent per-evidence profiles.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field, model_validator


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
    Unified representation of a single evidence item.
    Shared across Node.js ('evidences' collection) and Python microservice.
    """
    evidence_id: str = Field(default_factory=lambda: str(uuid4()))
    case_id: str = Field(..., description="Foreign key linking to ComplaintProfile case_id")
    filename: str = Field(..., description="Original filename of the evidence file")
    media_type: str = Field(..., description="Media category: image, audio, video, pdf, document")
    url: Optional[str] = Field(default=None, description="Cloudinary or storage URL")
    
    # Ingestion & Queue Lifecycle
    processing_status: str = Field(default="PENDING", description="PENDING | PROCESSING | PROCESSED | FAILED")
    job_ids: List[str] = Field(default_factory=list)
    processing_error: Optional[str] = None

    # Processed representations from deterministic media workers
    florence_description: Optional[str] = Field(default=None, description="Visual description from Florence-2 captioner")
    ocr_text: Optional[str] = Field(default=None, description="Extracted & translated OCR text from PaddleOCR")
    transcript: Optional[str] = Field(default=None, description="Audio/Video speech transcript from Whisper")
    pdf_text: Optional[str] = Field(default=None, description="Directly extracted text from digital PDF/Document")
    
    ai_metadata: Dict[str, Any] = Field(default_factory=dict, description="Nested aiMetadata dictionary compatible with Node Evidence model")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Technical metadata: size_bytes, duration, mime_type, resolution")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    processed_at: Optional[datetime] = Field(default=None)

    @model_validator(mode="before")
    @classmethod
    def map_node_evidence_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # Map Mongo ID
            if "_id" in data and "evidence_id" not in data:
                data["evidence_id"] = str(data["_id"])
            # Map case_id ObjectId
            if "case_id" in data and not isinstance(data["case_id"], str):
                data["case_id"] = str(data["case_id"])
            # Map filename / originalFilename
            if not data.get("filename") and data.get("originalFilename"):
                data["filename"] = data["originalFilename"]
            # Map url / storage_ref / secureUrl
            if not data.get("url"):
                data["url"] = data.get("storage_ref") or data.get("secureUrl") or data.get("cloudinaryUrl")
            # Map media_type / type
            if not data.get("media_type") and data.get("type"):
                data["media_type"] = data["type"]
            # Map aiMetadata fields into flat Python fields if missing
            ai_meta = data.get("aiMetadata") or data.get("ai_metadata") or {}
            if isinstance(ai_meta, dict):
                if not data.get("ocr_text") and ai_meta.get("ocrText"):
                    data["ocr_text"] = ai_meta["ocrText"]
                if not data.get("florence_description") and ai_meta.get("aiSummary"):
                    data["florence_description"] = ai_meta["aiSummary"]
                if not data.get("transcript") and ai_meta.get("speechTranscript"):
                    data["transcript"] = ai_meta["speechTranscript"]
                if not data.get("pdf_text") and ai_meta.get("pdfText"):
                    data["pdf_text"] = ai_meta["pdfText"]
            if not data.get("processing_status") and data.get("processingStatus"):
                data["processing_status"] = data["processingStatus"]
        return data

    @property
    def originalFilename(self) -> str:
        return self.filename

    @property
    def mimeType(self) -> str:
        return self.metadata.get("mime_type") or self.metadata.get("mimeType") or self.media_type


# ── ALIAS FOR BACKWARD COMPATIBILITY ──────────────────────────────────────────
EvidenceRecord = EvidenceProfile

