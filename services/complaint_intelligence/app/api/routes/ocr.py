"""M5 OCR Worker — REST API.

POST /ocr          — upload image, run PaddleOCR, return OCRWorkerOutput
GET  /ocr/health   — health check
"""
from __future__ import annotations

import base64
import uuid

from fastapi import APIRouter, HTTPException, UploadFile, File, status

from app.core.container import Container
from app.core.exceptions import InvalidImageError
from app.schemas.ocr import OCRWorkerOutput

router = APIRouter(prefix="/ocr", tags=["OCR Worker"])

_MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


@router.get("/health")
async def ocr_health():
    return {"status": "ok", "worker": "ocr_worker", "engine": "paddleocr"}


@router.post(
    "",
    response_model=OCRWorkerOutput,
    status_code=status.HTTP_200_OK,
    summary="Run PaddleOCR on an uploaded image",
    description=(
        "Upload any image (PNG, JPEG, TIFF, BMP). "
        "Returns structured OCR text, bounding boxes, confidence scores, "
        "detected language, and English translation. "
        "Automatically enqueues a Text Intelligence job with the extracted text."
    ),
)
async def run_ocr(file: UploadFile = File(...)):
    # ── Read & validate ───────────────────────────────────────────────────────
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )
    if len(image_bytes) > _MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size is {_MAX_FILE_SIZE // (1024*1024)} MB.",
        )

    # ── Build worker & run ────────────────────────────────────────────────────
    container = Container()
    worker = container.ocr_worker

    job_id = str(uuid.uuid4())
    payload = {
        "image_bytes_b64": base64.b64encode(image_bytes).decode("utf-8"),
        "file_name": file.filename or "upload",
        "evidence_id": None,
    }

    try:
        result = await worker.run(payload, job_id=job_id)
    except InvalidImageError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OCR processing failed: {exc}",
        )

    if not result.succeeded:
        err = result.error or "OCR failed"
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=err,
        )

    return OCRWorkerOutput.model_validate(result.output)
