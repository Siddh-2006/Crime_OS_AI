"""M6 Audio Worker — REST API.

GET  /audio/health  — health check
POST /audio         — upload audio file, run Whisper, return AudioWorkerOutput

Supported formats: MP3, WAV, OGG, FLAC, M4A, WEBM, OPUS
Max file size: 50 MB
"""
from __future__ import annotations

import base64
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.api.deps import get_di_container
from app.core.container import Container
from app.core.exceptions import InvalidAudioError, UnsupportedAudioFormatError
from app.schemas.audio import AudioWorkerOutput

router = APIRouter(prefix="/audio", tags=["Audio Worker"])

_MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

_SUPPORTED_MIME_TYPES: frozenset[str] = frozenset({
    "audio/mpeg",        # mp3
    "audio/wav",         # wav
    "audio/x-wav",       # wav (alternative)
    "audio/ogg",         # ogg / opus
    "audio/flac",        # flac
    "audio/x-flac",      # flac (alternative)
    "audio/mp4",         # m4a
    "audio/x-m4a",       # m4a (alternative)
    "audio/webm",        # webm
    "audio/aac",         # aac
    "audio/opus",        # opus
    "application/octet-stream",  # browsers sometimes send this for audio
})


@router.get(
    "/health",
    summary="Audio Worker health check",
    description="Returns 200 when the Audio Worker is ready to accept requests.",
)
async def audio_health():
    return {"status": "ok", "worker": "audio_worker", "engine": "faster-whisper"}


@router.post(
    "",
    response_model=AudioWorkerOutput,
    status_code=status.HTTP_200_OK,
    summary="Transcribe and analyse an audio file",
    description=(
        "Upload an audio file (MP3, WAV, OGG, FLAC, M4A, WEBM, OPUS — max 50 MB). "
        "Whisper detects the language, transcribes the speech, and translates to English "
        "if the source language is non-English. "
        "Automatically enqueues a Text Intelligence job with the extracted transcript. "
        "Returns a structured AudioWorkerOutput with metadata, transcript, and job IDs."
    ),
)
async def run_audio(
    file: UploadFile = File(..., description="Audio file to transcribe."),
    container: Container = Depends(get_di_container),
):
    # ── Read & validate ───────────────────────────────────────────────────────
    audio_bytes = await file.read()

    if not audio_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    if len(audio_bytes) > _MAX_FILE_SIZE:
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
                f"Supported: {', '.join(sorted(_SUPPORTED_MIME_TYPES - {'application/octet-stream'}))}."
            ),
        )

    # ── Build worker & run ────────────────────────────────────────────────────
    job_id = str(uuid.uuid4())
    payload = {
        "audio_bytes_b64": base64.b64encode(audio_bytes).decode("utf-8"),
        "file_name": file.filename or "upload.audio",
        "file_size_bytes": len(audio_bytes),
        "evidence_id": None,
    }

    worker = container.audio_worker

    try:
        result = await worker.run(payload, job_id=job_id)
    except (InvalidAudioError, UnsupportedAudioFormatError) as exc:
        raise HTTPException(status_code=exc.http_status, detail=exc.message)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Audio processing failed: {exc}",
        )

    if not result.succeeded:
        err = result.error or "Audio processing failed."
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=err,
        )

    assert result.output is not None
    return AudioWorkerOutput.model_validate(result.output)
