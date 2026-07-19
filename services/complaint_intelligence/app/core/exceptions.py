from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from app.core.logging import logger


class ComplaintIntelligenceException(Exception):
    """Base exception for the Complaint Intelligence Service."""
    def __init__(self, message: str, code: str = "INTERNAL_ERROR"):
        super().__init__(message)
        self.message = message
        self.code = code


class PipelineError(ComplaintIntelligenceException):
    """Raised when a phase of the pipeline execution fails."""
    def __init__(self, message: str, code: str = "PIPELINE_ERROR"):
        super().__init__(message, code)


class PreprocessingError(PipelineError):
    """Raised when pre-processing of complaint text fails."""
    def __init__(self, message: str):
        super().__init__(message, code="PREPROCESSING_ERROR")


def register_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers for standardized JSON error response formats."""

    @app.exception_handler(ComplaintIntelligenceException)
    async def custom_exception_handler(request: Request, exc: ComplaintIntelligenceException):
        logger.error(
            f"Custom exception raised: {exc.message}",
            extra={"code": exc.code, "path": request.url.path}
        )
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": exc.message, "code": exc.code},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        error_details = exc.errors()
        logger.warning(
            "Request validation failed",
            extra={"details": error_details, "path": request.url.path}
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": "Request validation failed",
                "details": error_details,
                "code": "VALIDATION_ERROR"
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        logger.error(
            f"HTTP exception: {exc.detail}",
            extra={"status_code": exc.status_code, "path": request.url.path}
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.detail, "code": "HTTP_ERROR"},
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        logger.critical(
            f"Unhandled exception: {str(exc)}",
            exc_info=exc,
            extra={"path": request.url.path}
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": "An internal server error occurred", "code": "INTERNAL_ERROR"},
        )
