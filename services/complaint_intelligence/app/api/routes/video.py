"""M7 Video Worker — REST API.

GET  /video/health  — health check
POST /video         — upload video file, run full pipeline, return VideoWorkerOutput

Supported formats: MP4, MOV, AVI, WEBM, MKV
Max file size: 200 MB
"""
from __future__ import annotations

import base64
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.api.deps import get_di_container
from app.core.container import Container
from app.core.exceptions import InvalidVideoError, UnsupportedVideoFormatError
from app.schemas.video import VideoWorkerOutput

router = APIRouter(prefix="/video", tags=["Video Worker"])

_MAX_FILE_SIZE = 200 * 1024 * 1024  # 200 MB

_SUPPORTED_MIME_TYPES: frozenset[str] = frozenset({
    "video/mp4",
    "video/quicktime",       # .mov
    "video/x-msvideo",      # .avi
    "video/webm",
    "video/x-matroska",     # .mkv
    "video/x-flv",
    "video/x-m4v",
    "application/octet-stream",  # generic upload
})


@router.get(
    "/health",
    summary="Video Worker health check",
    description="Returns 200 when the Video Worker is ready to accept requests.",
)
async def video_health():
    return {
        "status": "ok",
        "worker": "video_worker",
        "engines": ["scenedetect", "opencv", "image_worker", "audio_worker"],
    }


@router.post(
    "",
    response_model=VideoWorkerOutput,
    status_code=status.HTTP_200_OK,
    summary="Process a video file for scene detection, keyframe analysis, and transcription",
    description=(
        "Upload a video file (MP4, MOV, AVI, WEBM, MKV — max 200 MB). "
        "Detects scenes, extracts start/middle/end keyframes per scene, "
        "runs Florence-2 image understanding on each keyframe via ImageWorker, "
        "extracts and transcribes the audio track via AudioWorker (Whisper), "
        "and returns a complete VideoWorkerOutput with scene timeline and evidence profiles."
    ),
)
async def run_video(
    file: UploadFile = File(..., description="Video file to process."),
    container: Container = Depends(get_di_container),
):
    # ── Read & validate ───────────────────────────────────────────────────────
    video_bytes = await file.read()

    if not video_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    if len(video_bytes) > _MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size is {_MAX_FILE_SIZE // (1024 * 1024)} MB.",
        )

    content_type = (file.content_type or "").lower().split(";")[0].strip()
    if content_type and content_type not in _SUPPORTED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Unsupported content type '{content_type}'. "
                "Supported: video/mp4, video/quicktime, video/x-msvideo, video/webm, video/x-matroska."
            ),
        )

    # ── Build worker & run ────────────────────────────────────────────────────
    job_id = str(uuid.uuid4())
    payload = {
        "video_bytes_b64": base64.b64encode(video_bytes).decode("utf-8"),
        "file_name": file.filename or "upload.mp4",
        "file_size_bytes": len(video_bytes),
    }

    worker = container.video_worker

    try:
        result = await worker.run(payload, job_id=job_id)
    except (InvalidVideoError, UnsupportedVideoFormatError) as exc:
        raise HTTPException(status_code=exc.http_status, detail=exc.message)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Video processing failed: {exc}",
        )

    if not result.succeeded:
        err = result.error or "Video processing failed."
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=err,
        )

    assert result.output is not None
    return VideoWorkerOutput.model_validate(result.output)
