from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import logger
from app.core.exceptions import register_exception_handlers
from app.api.routes import base, analyze


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """FastAPI lifespan context for startup and shutdown logging."""
    logger.info(
        "Starting Complaint Intelligence Service",
        extra={"version": settings.APP_VERSION},
    )

    yield  # ── app is running ──

    logger.info("Shutting down Complaint Intelligence Service")


# ── Application factory ───────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Intelligent text preprocessing, document classification, OCR, entity extraction, "
        "and LLM reasoning pipeline for citizens' complaints and evidence."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS Middleware ───────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust as needed for specific security guidelines
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ── Register Global Error/Exceptions Handlers ─────────────────────────────────
register_exception_handlers(app)

# ── Include Routers ───────────────────────────────────────────────────────────
app.include_router(base.router)
app.include_router(analyze.router)
