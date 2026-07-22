"""
Domain exception hierarchy + FastAPI global exception handlers.
Every exception maps to a structured JSON error response.
"""
from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import logger


# ─── Domain exceptions ────────────────────────────────────────────────────────

class CrimeOSError(Exception):
    """Base for all domain exceptions."""
    http_status: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    error_code: str = "INTERNAL_ERROR"

    def __init__(self, message: str, *, details: dict | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class ValidationError(CrimeOSError):
    http_status = status.HTTP_422_UNPROCESSABLE_ENTITY
    error_code = "VALIDATION_ERROR"


class NotFoundError(CrimeOSError):
    http_status = status.HTTP_404_NOT_FOUND
    error_code = "NOT_FOUND"


class ConflictError(CrimeOSError):
    http_status = status.HTTP_409_CONFLICT
    error_code = "CONFLICT"


class ServiceUnavailableError(CrimeOSError):
    http_status = status.HTTP_503_SERVICE_UNAVAILABLE
    error_code = "SERVICE_UNAVAILABLE"


class PipelineError(CrimeOSError):
    http_status = status.HTTP_500_INTERNAL_SERVER_ERROR
    error_code = "PIPELINE_ERROR"


class LLMError(CrimeOSError):
    http_status = status.HTTP_502_BAD_GATEWAY
    error_code = "LLM_ERROR"


class WorkerError(CrimeOSError):
    http_status = status.HTTP_500_INTERNAL_SERVER_ERROR
    error_code = "WORKER_ERROR"


class InvalidImageError(CrimeOSError):
    """Image is corrupt, empty, or cannot be opened by PIL. Never retried."""
    http_status = status.HTTP_400_BAD_REQUEST
    error_code = "INVALID_IMAGE"


class UnsupportedFormatError(CrimeOSError):
    """Image format is not supported (BMP, TIFF raw, etc.). Never retried."""
    http_status = status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
    error_code = "UNSUPPORTED_FORMAT"


class InvalidAudioError(CrimeOSError):
    """Audio file is empty, corrupt, or cannot be decoded. Never retried."""
    http_status = status.HTTP_400_BAD_REQUEST
    error_code = "INVALID_AUDIO"


class UnsupportedAudioFormatError(CrimeOSError):
    """Audio MIME type is not supported. Never retried."""
    http_status = status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
    error_code = "UNSUPPORTED_AUDIO_FORMAT"


class InvalidVideoError(CrimeOSError):
    """Video file is empty, corrupt, or cannot be decoded. Never retried."""
    http_status = status.HTTP_400_BAD_REQUEST
    error_code = "INVALID_VIDEO"


class UnsupportedVideoFormatError(CrimeOSError):
    """Video MIME type / container is not supported. Never retried."""
    http_status = status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
    error_code = "UNSUPPORTED_VIDEO_FORMAT"


class InvalidPDFError(CrimeOSError):
    """PDF file is empty, corrupt, or cannot be opened. Never retried."""
    http_status = status.HTTP_400_BAD_REQUEST
    error_code = "INVALID_PDF"


class UnsupportedPDFError(CrimeOSError):
    """PDF type or version is not supported. Never retried."""
    http_status = status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
    error_code = "UNSUPPORTED_PDF"


# ─── Response builder ─────────────────────────────────────────────────────────

def _error_response(
    status_code: int,
    error_code: str,
    message: str,
    details: dict | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "success": False,
            "error": {
                "code": error_code,
                "message": message,
                **({"details": details} if details else {}),
            },
        },
    )


# ─── FastAPI handlers ─────────────────────────────────────────────────────────

def register_exception_handlers(app: FastAPI) -> None:
    """Attach global exception handlers to the FastAPI app."""

    @app.exception_handler(CrimeOSError)
    async def domain_exception_handler(request: Request, exc: CrimeOSError) -> JSONResponse:
        logger.warning(
            "Domain exception",
            extra={"code": exc.error_code, "error_msg": exc.message, "path": str(request.url)},
        )
        return _error_response(exc.http_status, exc.error_code, exc.message, exc.details or None)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        logger.warning("Request validation failed", extra={"errors": exc.errors(), "path": str(request.url)})
        return _error_response(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "VALIDATION_ERROR",
            "Request validation failed",
            {"errors": exc.errors()},
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _error_response(exc.status_code, "HTTP_ERROR", str(exc.detail))

    @app.exception_handler(Exception)
    async def generic_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.critical(
            "Unhandled exception",
            extra={"path": str(request.url)},
            exc_info=exc,
        )
        return _error_response(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "An unexpected error occurred.",
        )
