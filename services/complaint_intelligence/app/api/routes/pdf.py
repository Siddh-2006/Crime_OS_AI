"""M8 PDF Worker — REST API.

GET  /pdf/health  — health check
POST /pdf         — upload PDF, run full pipeline, return PDFWorkerOutput

Accepted: application/pdf (max 50 MB)
"""
from __future__ import annotations

import base64
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.api.deps import get_di_container
from app.core.container import Container
from app.schemas.pdf import PDFWorkerOutput

router = APIRouter(prefix="/pdf", tags=["PDF Worker"])

_MAX_FILE_SIZE = 50 * 1024 * 1024   # 50 MB

_ACCEPTED_MIME_TYPES: frozenset[str] = frozenset({
    "application/pdf",
    "application/x-pdf",
    "application/octet-stream",  # generic fallback upload
})


@router.get(
    "/health",
    summary="PDF Worker health check",
)
async def pdf_health():
    return {
        "status": "ok",
        "worker": "pdf_worker",
        "engines": ["pymupdf", "ocr_worker", "translation_engine"],
    }


@router.post(
    "",
    response_model=PDFWorkerOutput,
    status_code=status.HTTP_200_OK,
    summary="Process a PDF file — extract text, OCR scanned pages, translate, run Text Intelligence",
    description=(
        "Upload a PDF (max 50 MB). Digital pages use pymupdf text extraction; "
        "scanned (image-only) pages are rendered to JPEG and run through PaddleOCR. "
        "Non-English text is translated to English. A TextIntelligence job is queued "
        "with the merged full-document text. Returns a structured PDFWorkerOutput "
        "with per-page results and evidence metadata."
    ),
)
async def run_pdf(
    file: UploadFile = File(..., description="PDF file to process."),
    container: Container = Depends(get_di_container),
):
    pdf_bytes = await file.read()

    if not pdf_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    if len(pdf_bytes) > _MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size is {_MAX_FILE_SIZE // (1024 * 1024)} MB.",
        )

    content_type = (file.content_type or "").lower().split(";")[0].strip()
    if content_type and content_type not in _ACCEPTED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported content type '{content_type}'. Expected application/pdf.",
        )

    job_id = str(uuid.uuid4())
    payload = {
        "pdf_bytes_b64": base64.b64encode(pdf_bytes).decode("utf-8"),
        "file_name": file.filename or "document.pdf",
        "file_size_bytes": len(pdf_bytes),
    }

    worker = container.pdf_worker
    try:
        result = await worker.run(payload, job_id=job_id)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PDF processing failed: {exc}",
        )

    if not result.succeeded:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.error or "PDF processing failed.",
        )

    assert result.output is not None
    return PDFWorkerOutput.model_validate(result.output)
