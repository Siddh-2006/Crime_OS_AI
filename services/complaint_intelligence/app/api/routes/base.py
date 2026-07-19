from fastapi import APIRouter
from fastapi.responses import JSONResponse
from app.core.config import settings

router = APIRouter(tags=["Health"])


@router.get("/health", summary="Health check endpoint")
async def health() -> JSONResponse:
    """Returns the service health status."""
    return JSONResponse(
        content={
            "status": "ok",
            "service": settings.APP_NAME,
            "version": settings.APP_VERSION,
        }
    )
