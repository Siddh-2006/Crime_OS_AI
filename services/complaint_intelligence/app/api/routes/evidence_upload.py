"""
Secure Evidence Upload API Routes.

Public endpoints (authenticated by upload token only — no session required):
  POST /evidence/upload/{token}          — Upload one or more evidence files (202 Accepted)

Internal management endpoints (accessed by Node.js backend via service network):
  POST /evidence/upload-token/generate   — Generate upload token for a case
  GET  /evidence/upload-token/{case_id}  — Get token + QR code for a case
  DELETE /evidence/upload-token/{token}/revoke — Revoke a token

Architecture:
  The upload endpoint is fully async — it validates the token, creates EvidenceRecords,
  enqueues EVIDENCE_UPLOADED jobs into Redis, and returns HTTP 202 immediately.
  All processing (workers + LLM fusion) happens in the background via AnalysisWorker.
"""
from __future__ import annotations

import base64
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Request, UploadFile, status

from app.case_understanding.file_validator import FileValidator
from app.case_understanding.qr_service import QRCodeService
from app.case_understanding.upload_token_repository import (
    IEvidenceRecordRepository,
    IUploadTokenRepository,
)
from app.core.config import settings
from app.core.container import Container, get_container
from app.core.logging import logger
from app.api.deps import get_queue
from app.queue.interface import IQueue
from app.queue.job import Job, JobType
from app.schemas.upload_token import (
    EvidenceProcessingStatus,
    EvidenceRecord,
    TokenGenerateResponse,
    UploadAcceptedItem,
    UploadAcceptedResponse,
    UploadMetadata,
    UploadMethod,
    UploaderType,
)

router = APIRouter(prefix="/evidence", tags=["Secure Evidence Upload"])

_file_validator = FileValidator(max_size_bytes=settings.EVIDENCE_MAX_FILE_SIZE_MB * 1024 * 1024)
_qr_service = QRCodeService()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_upload_url(token: str) -> str:
    """Construct the public upload URL for a token."""
    base = settings.EVIDENCE_UPLOAD_BASE_URL.rstrip("/")
    return f"{base}/evidence/upload/{token}"


def _upload_url_template() -> str:
    """Template with {token} placeholder for get_or_create."""
    base = settings.EVIDENCE_UPLOAD_BASE_URL.rstrip("/")
    return f"{base}/evidence/upload/{{token}}"


# ── 1. Public Evidence Upload (token-authenticated) ───────────────────────────

@router.post(
    "/upload/{token}",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=UploadAcceptedResponse,
    summary="Upload evidence files for a case (token-authenticated)",
    description=(
        "Anyone possessing a valid upload token can submit one or more evidence files. "
        "Accepts images, video, audio, PDF, and office documents. "
        "Returns HTTP 202 immediately — processing happens asynchronously in the background. "
        "Each file gets its own EvidenceRecord, is processed by the appropriate worker, "
        "and triggers an incremental CaseIntelligence fusion."
    ),
)
async def upload_evidence(
    token: str,
    request: Request,
    files: List[UploadFile] = File(..., description="One or more evidence files"),
    uploader_type: UploaderType = Form(default=UploaderType.CITIZEN),
    upload_method: UploadMethod = Form(default=UploadMethod.LINK),
    x_forwarded_for: Optional[str] = Header(default=None),
    user_agent: Optional[str] = Header(default=None),
    queue: IQueue = Depends(get_queue),
    container: Container = Depends(get_container),
) -> UploadAcceptedResponse:
    # ── 1. Token validation ───────────────────────────────────────────────────
    token_repo: IUploadTokenRepository = container.upload_token_repository
    upload_token = await token_repo.get_by_token(token)

    if upload_token is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Upload token not found.",
        )

    if not upload_token.is_valid:
        reason = "revoked" if upload_token.is_revoked else "expired"
        logger.warning(
            "[evidence_upload] Rejected upload — token invalid",
            extra={"token_prefix": token[:8], "reason": reason},
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Upload token has been {reason}.",
        )

    case_id = upload_token.case_id  # Internal case_id — never echoed in response URL

    if not files:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one file must be uploaded.",
        )

    # ── 2. Client metadata ────────────────────────────────────────────────────
    ip_addr = x_forwarded_for or (request.client.host if request.client else None)

    evidence_record_repo: IEvidenceRecordRepository = container.evidence_record_repository

    accepted_items: list[UploadAcceptedItem] = []

    for upload_file in files:
        filename = upload_file.filename or f"unnamed-{uuid.uuid4().hex[:8]}"

        # Read bytes
        try:
            file_bytes = await upload_file.read()
        except Exception as exc:
            logger.warning(
                "[evidence_upload] Failed to read file bytes",
                extra={"file_name": filename, "error": str(exc)},
            )
            # Continue processing remaining files
            continue

        # ── 4. File validation (MIME + size) ──────────────────────────────────
        validation = _file_validator.validate(
            file_bytes=file_bytes,
            filename=filename,
            declared_content_type=upload_file.content_type or "",
        )

        if not validation.is_valid:
            logger.warning(
                "[evidence_upload] File rejected by validator",
                extra={"file_name": filename, "reason": validation.rejection_reason},
            )
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"File '{filename}': {validation.rejection_reason}",
            )

        # ── 5. Create EvidenceRecord ──────────────────────────────────────────
        evidence_id = str(uuid.uuid4())
        upload_meta = UploadMetadata(
            uploader_type=uploader_type,
            upload_method=upload_method,
            ip_address=ip_addr,
            user_agent=user_agent,
            original_filename=filename,
            file_size_bytes=len(file_bytes),
            detected_mime_type=validation.detected_mime_type,
        )

        # ── 6. Enqueue EVIDENCE_UPLOADED job ──────────────────────────────────
        job = Job(
            job_type=JobType.EVIDENCE_UPLOADED,
            payload={
                "case_id": case_id,
                "evidence_id": evidence_id,
                "filename": filename,
                "content_type": validation.detected_mime_type,
                "file_bytes_b64": base64.b64encode(file_bytes).decode("utf-8"),
            },
            correlation_id=case_id,
        )
        job_id = await queue.enqueue(job)

        record = EvidenceRecord(
            evidence_id=evidence_id,
            case_id=case_id,
            job_ids=[job_id],
            upload_metadata=upload_meta,
            processing_status=EvidenceProcessingStatus.PENDING,
        )

        # ── 7. Persist EvidenceRecord ─────────────────────────────────────────
        try:
            await evidence_record_repo.save(record)
        except Exception as exc:
            logger.warning(
                "[evidence_upload] Failed to save EvidenceRecord (non-fatal — job already queued)",
                extra={"evidence_id": evidence_id, "error": str(exc)},
            )

        logger.info(
            "[evidence_upload] Evidence queued successfully",
            extra={
                "evidence_id": evidence_id,
                "case_id": case_id,
                "job_id": job_id,
                "file_name": filename,
                "media_type": validation.media_type,
                "file_size_bytes": len(file_bytes),
            },
        )

        accepted_items.append(
            UploadAcceptedItem(
                evidence_id=evidence_id,
                filename=filename,
                media_type=validation.media_type,
                job_id=job_id,
                processing_status=EvidenceProcessingStatus.PENDING,
            )
        )

    # ── 8. Increment token upload counter ─────────────────────────────────────
    if accepted_items:
        try:
            await token_repo.increment_upload_count(token)
        except Exception as exc:
            logger.warning(
                "[evidence_upload] Failed to increment upload_count",
                extra={"token_prefix": token[:8], "error": str(exc)},
            )

    if not accepted_items:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No files could be accepted. Check file types and sizes.",
        )

    return UploadAcceptedResponse(
        accepted=True,
        case_id=case_id,
        total_files=len(accepted_items),
        items=accepted_items,
    )


# ── 2. Token Generation (Internal) ───────────────────────────────────────────

class TokenGenerateRequest(
    __import__("pydantic").BaseModel,
):
    case_id: str
    complaint_number: Optional[str] = None


@router.post(
    "/upload-token/generate",
    status_code=status.HTTP_201_CREATED,
    response_model=TokenGenerateResponse,
    summary="Generate upload token for a case [internal]",
    description=(
        "Creates a cryptographically secure upload token mapped to the case. "
        "Idempotent — returns existing token if one already exists for this case. "
        "Called by Node.js backend after complaint registration."
    ),
)
async def generate_upload_token(
    body: TokenGenerateRequest,
    container: Container = Depends(get_container),
) -> TokenGenerateResponse:
    token_repo: IUploadTokenRepository = container.upload_token_repository
    ut = await token_repo.get_or_create(
        case_id=body.case_id,
        complaint_number=body.complaint_number,
        upload_url_template=_upload_url_template(),
    )
    qr_b64 = _qr_service.generate_base64_png(ut.upload_url)
    return TokenGenerateResponse(
        token=ut.token,
        upload_url=ut.upload_url,
        qr_code_base64=qr_b64,
        case_id=ut.case_id,
        complaint_number=ut.complaint_number,
    )


# ── 3. Get Token Info (Internal) ──────────────────────────────────────────────

@router.get(
    "/upload-token/{case_id}",
    response_model=TokenGenerateResponse,
    summary="Get upload token and QR code for a case [internal]",
    description="Returns the upload URL and QR code PNG for the given case. Used by officer dashboard.",
)
async def get_upload_token(
    case_id: str,
    container: Container = Depends(get_container),
) -> TokenGenerateResponse:
    token_repo: IUploadTokenRepository = container.upload_token_repository
    ut = await token_repo.get_by_case_id(case_id)
    if ut is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No upload token found for case '{case_id}'.",
        )
    qr_b64 = _qr_service.generate_base64_png(ut.upload_url)
    return TokenGenerateResponse(
        token=ut.token,
        upload_url=ut.upload_url,
        qr_code_base64=qr_b64,
        case_id=ut.case_id,
        complaint_number=ut.complaint_number,
    )


# ── 4. Revoke Token (Internal) ────────────────────────────────────────────────

@router.delete(
    "/upload-token/{token}/revoke",
    status_code=status.HTTP_200_OK,
    summary="Revoke an upload token [internal]",
    description=(
        "Permanently revokes a token. All subsequent upload attempts using this token will be rejected. "
        "Called by officer action or automatically on case closure."
    ),
)
async def revoke_upload_token(
    token: str,
    container: Container = Depends(get_container),
) -> dict:
    token_repo: IUploadTokenRepository = container.upload_token_repository
    ut = await token_repo.get_by_token(token)
    if ut is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token not found.",
        )
    await token_repo.revoke(token)
    logger.info(
        "[evidence_upload] Token revoked by officer",
        extra={"token_prefix": token[:8], "case_id": ut.case_id},
    )
    return {"revoked": True, "token": token[:8] + "...", "case_id": ut.case_id}


# ── 5. Revoke All Tokens by Case (Internal) ───────────────────────────────────

@router.delete(
    "/upload-token/by-case/{case_id}/revoke",
    status_code=status.HTTP_200_OK,
    summary="Revoke all upload tokens for a case [internal]",
    description="Called automatically when a case is closed.",
)
async def revoke_tokens_for_case(
    case_id: str,
    container: Container = Depends(get_container),
) -> dict:
    token_repo: IUploadTokenRepository = container.upload_token_repository
    await token_repo.revoke_by_case_id(case_id)
    logger.info("[evidence_upload] All tokens revoked for case", extra={"case_id": case_id})
    return {"revoked": True, "case_id": case_id}
