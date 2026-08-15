"""
main.py — FastAPI entry point for the Prompt Compression Service.

Endpoints:
  GET  /health    — liveness probe
  POST /compress  — compress text using LLMLingua-2
"""
from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.compressor import MODEL_NAME, compress, get_compressor
from app.schemas import CompressRequest, CompressResponse

# ── Logger ───────────────────────────────────────────────────────────────────
logger = logging.getLogger("prompt-compression")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
logger.propagate = False


# ── Lifespan: eagerly warm up the model on startup ────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Prompt Compression Service starting — warming up LLMLingua-2 model...")
    try:
        get_compressor()   # populates lru_cache
        logger.info("Model ready.")
    except Exception as exc:
        logger.error("Failed to load model on startup: %s", exc)
        # Allow the service to start; model will be retried on first request.
    yield
    logger.info("Prompt Compression Service shutting down.")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Prompt Compression Service",
    description="LLMLingua-2 based prompt compressor for Crime OS AI pipeline.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["Utility"])
def health():
    """Liveness probe."""
    return {"status": "ok", "model": MODEL_NAME}


@app.post("/compress", response_model=CompressResponse, tags=["Compression"])
def compress_endpoint(body: CompressRequest):
    """
    Compress *text* using LLMLingua-2.

    - Pass `target_token_count` to pin the output length.
    - Pass `rate` (0.01–0.99) to compress by fraction instead.
    - Pass `force_tokens` to guarantee specific tokens/phrases are never removed.
    """
    if not body.text.strip():
        raise HTTPException(status_code=422, detail="'text' must not be empty.")

    try:
        result = compress(
            text=body.text,
            rate=body.rate,
            target_token_count=body.target_token_count,
            force_tokens=body.force_tokens,
        )
    except Exception as exc:
        logger.exception("Compression failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Compression error: {exc}") from exc

    return CompressResponse(**result)
