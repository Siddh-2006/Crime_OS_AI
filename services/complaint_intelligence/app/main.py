"""
FastAPI application factory.

Startup sequence:
  1. Validate configuration (pydantic-settings raises on missing vars)
  2. Test Redis reachability (warn but don't crash — allows offline dev)
  3. Mount routers
  4. Register exception handlers
  5. Expose OpenAPI at /docs and /redoc

Shutdown sequence:
  1. Close Redis connection pool
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import complaint, health, jobs, image, ocr, audio, video, pdf, case_understanding, evidence_upload
from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import logger
from app.core.mongo import close_mongo
from app.core.redis import close_redis, ping_redis


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # ── Startup ───────────────────────────────────────────────────────────────
    logger.info(
        "Starting service",
        extra={"service": settings.APP_NAME, "version": settings.APP_VERSION, "env": settings.APP_ENV},
    )

    # Ensure MongoDB B-Tree indexes asynchronously in background
    import asyncio
    from app.core.mongo import ensure_mongo_indexes
    asyncio.create_task(ensure_mongo_indexes())

    redis_ok = await ping_redis()
    if redis_ok:
        logger.info("Redis connection verified")
        
        # Start background AnalysisWorker runner
        from app.core.container import get_container
        from app.core.redis import get_redis
        from app.queue.redis_queue import RedisQueue
        from app.queue.worker_runner import AnalysisWorker

        redis_client = await get_redis()
        queue = RedisQueue(redis_client)
        container = get_container()
        
        worker_runner = AnalysisWorker(queue, container)
        worker_runner.start()
        app.state.worker_runner = worker_runner
    else:
        logger.warning(
            "Redis is unreachable at startup — queue operations will fail. "
            "Start Redis or check REDIS_HOST/REDIS_PORT.",
        )

    try:
        yield  # ── Application running ───────────────────────────────────────────
    finally:
        # ── Shutdown ──────────────────────────────────────────────────────────────
        if hasattr(app.state, "worker_runner"):
            try:
                await app.state.worker_runner.stop()
            except Exception as exc:
                logger.warning(f"Error stopping worker_runner: {exc}")
            
        await close_redis()
        await close_mongo()
        logger.info("Service stopped cleanly")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description=(
            "AI-powered complaint intelligence pipeline for Crime OS. "
            "Processes complaints and evidence through OCR, vision AI, "
            "and single-pass LLM Case Understanding."
        ),
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if not settings.is_production else ["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(health.router)
    app.include_router(jobs.router)
    app.include_router(complaint.router)
    app.include_router(image.router)
    app.include_router(ocr.router)
    app.include_router(audio.router)
    app.include_router(video.router)
    app.include_router(pdf.router)
    app.include_router(case_understanding.router)
    app.include_router(evidence_upload.router)

    # ── Exception handlers ────────────────────────────────────────────────────
    register_exception_handlers(app)

    return app


app = create_app()
