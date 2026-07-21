"""
Image analysis endpoint — POST /analyze-image.

Accepts a multipart image upload, runs the ImageWorker pipeline synchronously,
and returns an EvidenceProfile.

HTTP Status codes:
  200 OK        — complete EvidenceProfile (no text detected)
  202 Accepted  — pending_ocr EvidenceProfile (OCR job queued)
  400 Bad Request       — invalid or corrupt image
  415 Unsupported Media — image format not supported
  422 Unprocessable     — missing file field (FastAPI validation)
  502 Bad Gateway       — Florence-2 service unreachable
"""
from __future__ import annotations

import base64
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.api.deps import get_di_container, get_queue
from app.core.container import Container
from app.core.exceptions import InvalidImageError, UnsupportedFormatError, LLMError
from app.image_worker.worker import ImageWorker
from app.queue.interface import IQueue
from app.schemas.evidence import EvidenceProfile

router = APIRouter(tags=["Image Worker"])

# Accepted MIME types (FastAPI does not enforce this automatically)
_ALLOWED_MIME_PREFIXES = ("image/jpeg", "image/png", "image/webp", "image/tiff", "image/gif", "image/bmp")


@router.post(
    "/analyze-image",
    response_model=EvidenceProfile,
    status_code=status.HTTP_200_OK,
    summary="Analyse an uploaded image",
    description=(
        "Upload an image file. The worker will:\n"
        "1. Validate and extract metadata (Pillow)\n"
        "2. Preprocess (orientation correction, resize)\n"
        "3. Detect text presence\n"
        "4. If no text: run Florence-2 captioning → return EvidenceProfile (200)\n"
        "5. If text detected: enqueue OCR job → return pending EvidenceProfile (202)"
    ),
    responses={
        200: {"description": "EvidenceProfile — image fully analysed."},
        202: {"description": "EvidenceProfile — OCR job queued, analysis pending."},
        400: {"description": "Invalid or corrupt image."},
        415: {"description": "Unsupported image format."},
        502: {"description": "Florence-2 service unreachable."},
    },
)
async def analyze_image(
    file: Annotated[UploadFile, File(description="Image file (JPEG, PNG, WEBP, TIFF, GIF, BMP)")],
    container: Annotated[Container, Depends(get_di_container)],
    queue: Annotated[IQueue, Depends(get_queue)],
) -> EvidenceProfile:
    # Validate content type
    content_type = file.content_type or ""
    if not any(content_type.startswith(p) for p in _ALLOWED_MIME_PREFIXES):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported content type '{content_type}'. Expected an image.",
        )

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    payload = {
        "image_bytes_b64": base64.b64encode(image_bytes).decode("utf-8"),
        "file_name": file.filename or "upload.jpg",
        "file_size_bytes": len(image_bytes),
    }

    worker = ImageWorker(
        metadata_extractor=container.metadata_extractor,
        preprocessor=container.image_preprocessor,
        text_detector=container.text_detector,
        captioner=container.image_captioner,
        evidence_builder=container.evidence_builder,
        queue=queue,
    )

    try:
        result = await worker.run(payload, job_id=f"img-{file.filename}")
    except InvalidImageError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message)
    except UnsupportedFormatError as exc:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=exc.message)
    except LLMError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=exc.message)

    if not result.succeeded:
        err = result.error or "Image processing failed."
        # Map domain exception messages to appropriate HTTP codes
        if any(kw in err for kw in ("corrupt", "empty", "unreadable", "decode", "contain", "Payload")):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err)
        if "not supported" in err or "Unsupported" in err or "format" in err.lower():
            raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=err)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Image processing failed: {err}",
        )

    profile = EvidenceProfile.model_validate(result.output)
    http_status = (
        status.HTTP_202_ACCEPTED if profile.status == "pending_ocr" else status.HTTP_200_OK
    )

    from fastapi.responses import JSONResponse
    return JSONResponse(
        content=profile.model_dump(mode="json"),
        status_code=http_status,
    )
