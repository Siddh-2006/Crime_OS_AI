"""
Crime OS AI Recommendation Microservice — FastAPI application entry point.

Startup lifecycle:
  1. Ensure Qdrant collection exists (create if not)
  2. Log service ready state

Shutdown lifecycle:
  1. Close HTTP connections (embedder client)
"""
from contextlib import asynccontextmanager
from typing import AsyncGenerator

# pyrefly: ignore [missing-import]
from fastapi import FastAPI, Request
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware
# pyrefly: ignore [missing-import]
from fastapi.responses import JSONResponse
import time

from app.core.config import settings
from app.core.logging import logger
from app.vector.qdrant.client import ensure_collection
from app.vector.embeddings.embedder import embedder
from app.api.routes import embed, recommend


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """FastAPI lifespan context — replaces deprecated startup/shutdown events."""
    logger.info(
        "Starting Crime OS AI Service",
        extra={"version": settings.APP_VERSION},
    )

    # Ensure Qdrant collection is ready
    try:
        await ensure_collection()
    except Exception as exc:
        logger.error(
            "Failed to connect to Qdrant on startup — service will still start "
            "but embedding/search will fail until Qdrant is reachable.",
            extra={"error": str(exc)},
        )

    logger.info("Crime OS AI Service ready")

    yield  # ── app is running ──

    # Graceful shutdown
    logger.info("Shutting down — closing HTTP connections")
    await embedder.close()
    logger.info("Shutdown complete")


# ── Application factory ───────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Semantic retrieval microservice for the Crime OS platform. "
        "Provides AI-powered Investigation Officer recommendations based on "
        "similarity to historically closed FIR cases stored in Qdrant."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS (internal service; restrict in production) ───────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten in production to Node backend host
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    try:
        body_bytes = await request.body()
        async def receive():
            return {"type": "http.request", "body": body_bytes}
        request._receive = receive
        body_str = body_bytes.decode('utf-8')
    except Exception:
        body_str = "<could not read body>"

    logger.info(f"Incoming Request: {request.method} {request.url.path} | Body: {body_str[:500]}")
    
    response = await call_next(request)
    process_time = time.time() - start_time
    
    logger.info(f"Response: {request.method} {request.url.path} | Status: {response.status_code} | Time: {process_time:.4f}s")
    return response

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(embed.router)
app.include_router(recommend.router)


# ── Health check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"], summary="Service health check")
async def health() -> JSONResponse:
    return JSONResponse(
        content={
            "status": "ok",
            "service": settings.APP_NAME,
            "version": settings.APP_VERSION,
        }
    )
