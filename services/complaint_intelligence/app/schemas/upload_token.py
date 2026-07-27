"""
Domain schemas for the Secure Evidence Upload System.

UploadToken   — one-per-case cryptographic token document stored in MongoDB.
EvidenceRecord — raw upload record created immediately on file receipt (before processing).
UploadMetadata — immutable audit metadata attached to every uploaded file.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


# ── Enumerations ──────────────────────────────────────────────────────────────

class UploaderType(str, Enum):
    CITIZEN   = "citizen"
    POLICE    = "police"
    WITNESS   = "witness"
    HOSPITAL  = "hospital"
    FORENSICS = "forensics"
    LAWYER    = "lawyer"
    OTHER     = "other"


class UploadMethod(str, Enum):
    QR_CODE = "qr_code"
    LINK    = "link"


class EvidenceProcessingStatus(str, Enum):
    PENDING    = "pending"    # File received, job queued
    PROCESSING = "processing" # Worker running
    COMPLETED  = "completed"  # EvidenceProfile created, LLM fused
    FAILED     = "failed"     # Worker failed, see error field


# ── Upload Token ──────────────────────────────────────────────────────────────

class UploadToken(BaseModel):
    """
    One per case.  Permanent while the case is active.
    Revocable by officer or automatically revoked on case closure.
    The public URL never exposes the internal case_id — only the token is visible.
    """
    token: str = Field(
        description="32-byte URL-safe cryptographically random string (primary key)"
    )
    case_id: str = Field(
        description="Internal case_id — NEVER exposed through the public upload URL"
    )
    complaint_number: Optional[str] = Field(
        default=None,
        description="Human-readable complaint reference",
    )
    upload_url: str = Field(
        description="Full public upload URL: {BASE_URL}/evidence/upload/{token}"
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    expires_at: Optional[datetime] = Field(
        default=None,
        description="None = permanent (no expiry). Set when case is closed.",
    )
    is_revoked: bool = Field(
        default=False,
        description="Officer can revoke manually; auto-revoked on case closure.",
    )
    upload_count: int = Field(
        default=0,
        description="Audit counter: total files uploaded via this token.",
    )
    last_upload_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp of the most recent successful upload.",
    )

    @property
    def is_valid(self) -> bool:
        """True if the token is active, not revoked, and not expired."""
        if self.is_revoked:
            return False
        if self.expires_at and datetime.now(timezone.utc) > self.expires_at:
            return False
        return True


# ── Upload Metadata ───────────────────────────────────────────────────────────

class UploadMetadata(BaseModel):
    """
    Immutable audit metadata captured at upload time.
    Attached to every EvidenceRecord and propagated to EvidenceProfile.metadata.
    """
    uploader_type: UploaderType = Field(
        default=UploaderType.CITIZEN,
        description="Who is submitting this evidence.",
    )
    upload_method: UploadMethod = Field(
        default=UploadMethod.LINK,
        description="How the uploader accessed the endpoint (QR scan vs direct link).",
    )
    uploaded_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    ip_address: Optional[str] = Field(
        default=None,
        description="Uploader IP (optional, for forensic audit trail).",
    )
    user_agent: Optional[str] = Field(
        default=None,
        description="Browser/device user-agent string.",
    )
    original_filename: str = Field(
        description="Filename as provided by uploader."
    )
    file_size_bytes: int = Field(description="Raw file size in bytes.")
    detected_mime_type: str = Field(
        description="MIME type detected from magic bytes (not just extension)."
    )


# ── Evidence Record ───────────────────────────────────────────────────────────

class EvidenceRecord(BaseModel):
    """
    Raw upload record.  Created immediately on file receipt (< 1ms).
    Persisted BEFORE any background processing begins.
    EvidenceProfile is created later by the background worker.
    """
    evidence_id: str = Field(
        default_factory=lambda: str(uuid4()),
        description="Stable UUID — used as the EvidenceProfile.evidence_id later.",
    )
    case_id: str = Field(
        description="Resolved from upload token."
    )
    job_ids: List[str] = Field(
        default_factory=list,
        description="Redis job IDs for all background jobs created for this record.",
    )
    upload_metadata: UploadMetadata
    url: Optional[str] = Field(
        default=None,
        description="Cloudinary storage URL once uploaded.",
    )
    processing_status: EvidenceProcessingStatus = Field(
        default=EvidenceProcessingStatus.PENDING
    )
    processing_error: Optional[str] = Field(
        default=None,
        description="Error message if processing_status == FAILED.",
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    completed_at: Optional[datetime] = Field(
        default=None,
        description="When EvidenceProfile was persisted and LLM fusion completed.",
    )
    extra: Dict[str, Any] = Field(
        default_factory=dict,
        description="Reserved for future extension.",
    )


# ── API Response Models ───────────────────────────────────────────────────────

class TokenGenerateResponse(BaseModel):
    """Returned from POST /evidence/upload-token/generate and register-complaint."""
    token: str
    upload_url: str
    qr_code_base64: str = Field(
        description="data:image/png;base64,{...} — directly embeddable in HTML/email."
    )
    case_id: str
    complaint_number: Optional[str] = None


class UploadAcceptedItem(BaseModel):
    """Per-file result returned in HTTP 202 response."""
    evidence_id: str
    filename: str
    media_type: str
    job_id: str
    processing_status: EvidenceProcessingStatus = EvidenceProcessingStatus.PENDING


class UploadAcceptedResponse(BaseModel):
    """HTTP 202 response body for POST /evidence/upload/{token}."""
    accepted: bool = True
    case_id: str
    total_files: int
    items: List[UploadAcceptedItem]
    message: str = "Evidence upload accepted. Processing will complete in the background."
