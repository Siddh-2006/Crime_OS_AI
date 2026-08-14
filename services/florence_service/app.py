"""
Florence-2 REST Service
=======================
Exposes: POST /predict
Body:    { "image_base64": "<base64>", "task": "<OCR>" | "<MORE_DETAILED_CAPTION>" | "<CAPTION>" }
Returns: { "result": "<text>" }

Runs on: http://localhost:8002
Model:   microsoft/Florence-2-base (CPU, ~450MB, downloaded once on first request)

Start with:
    python app.py
    -- or --
    uvicorn app:app --host 0.0.0.0 --port 8002
"""
from __future__ import annotations

import sys
if sys.version_info >= (3, 13):
    print("\n" + "="*80)
    print("❌ FATAL ERROR: You are running Python 3.13 (Global Environment)!")
    print("You MUST run this using the .venv we created, which uses Python 3.12.")
    print("Please CLOSE this terminal, and simply double-click start_all.bat")
    print("="*80 + "\n")
    sys.exit(1)

import base64
import io
import logging
import os
import sys
import time
import types

# ── Load .env early so VISION_BACKEND is available before lifespan ────────────
try:
    from dotenv import load_dotenv as _load_dotenv
    _load_dotenv()
except ImportError:
    pass  # dotenv not installed — rely on shell environment

# ── flash_attn: combined CPU-safe patch ──────────────────────────────────────
# Florence-2 has TWO separate checks that must both be bypassed on CPU Windows:
#
# 1. check_imports() — statically scans modeling_florence2.py and calls
#    importlib.import_module("flash_attn"). Solution: put a stub in sys.modules.
#    The stub needs __spec__ != None so find_spec() doesn't raise ValueError.
#
# 2. is_flash_attn_2_available() — called at runtime inside the model module.
#    Solution: patch the transformers utility function to return False.
#
import types
from importlib.machinery import ModuleSpec

_fa_stub = types.ModuleType("flash_attn")
_fa_stub.__spec__ = ModuleSpec("flash_attn", None)   # non-None spec for find_spec
# Bypass the strict check_imports that crashes on missing flash_attn
import transformers.dynamic_module_utils as _dmu
_dmu.check_imports = lambda filename: []
sys.modules.setdefault("flash_attn.flash_attn_interface", _fa_stub)

import transformers.utils.import_utils as _tiu
_tiu.is_flash_attn_2_available = lambda: False
_tiu.is_flash_attn_greater_or_equal_2_10 = lambda: False  # type: ignore


from contextlib import asynccontextmanager
from functools import lru_cache

import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoProcessor

MODEL_ID = "microsoft/Florence-2-base"

logger = logging.getLogger("florence-service")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
logger.propagate = False

# ── Model loading ─────────────────────────────────────────────────────────────

class _ModelState:
    model: AutoModelForCausalLM | None = None
    processor: AutoProcessor | None = None
    device: str | None = None

_state = _ModelState()


def load_model():
    if _state.model is not None:
        return
    logger.info("Loading Florence-2 model", extra={"model_id": MODEL_ID})
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32
    _state.device = device
    _state.model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        torch_dtype=dtype,
        trust_remote_code=True,
    ).to(device)
    _state.processor = AutoProcessor.from_pretrained(MODEL_ID, trust_remote_code=True)
    logger.info("Florence-2 model loaded", extra={"device": device, "model_id": MODEL_ID})


# ── FastAPI app ───────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Skip model loading in production when using Gemini Vision backend
    if os.environ.get("VISION_BACKEND", "florence").lower() != "gemini":
        load_model()
    else:
        logger.info("VISION_BACKEND=gemini — skipping Florence model load")
    yield


app = FastAPI(
    title="Florence-2 Inference Service",
    description="REST wrapper for microsoft/Florence-2-base. Used by Crime OS Image Worker.",
    version="1.0.0",
    lifespan=lifespan,
)


class PredictRequest(BaseModel):
    image_base64: str
    task: str = "<CAPTION>"


class PredictResponse(BaseModel):
    result: str
    task: str


# ── Gemini Vision helper ──────────────────────────────────────────────────────
# Task-specific prompts designed to replicate Florence-2 output format exactly:
#
# Florence <CAPTION>               → 1-sentence scene description
# Florence <MORE_DETAILED_CAPTION> → 2-4 sentence rich description with all
#                                    visible objects, people, text, setting
# Florence <OCR>                   → verbatim text found in the image, one
#                                    item per line (mirrors Florence OCR output)

_GEMINI_PROMPTS: dict[str, str] = {
    "<CAPTION>": (
        "Describe this image in one clear, concise sentence. "
        "Focus on the main subject and setting. "
        "Output only the sentence, nothing else."
    ),
    "<MORE_DETAILED_CAPTION>": (
        "Write a detailed description of this image in 2-4 sentences. "
        "Include: the primary subject or scene, any visible people (appearance, actions, count), "
        "vehicles (type, colour, position), objects of note, text visible in the image, "
        "the setting or location type (indoor/outdoor/document), and any contextually "
        "important details. Be specific and factual — describe only what you can see. "
        "Output only the description, no headings or labels."
    ),
    "<OCR>": (
        "Extract all text visible in this image. "
        "Preserve the original reading order. Output each distinct text element on its own line. "
        "If no readable text is present, output an empty string. "
        "Output only the extracted text, nothing else."
    ),
}

_DEFAULT_GEMINI_PROMPT = _GEMINI_PROMPTS["<MORE_DETAILED_CAPTION>"]


def _gemini_predict(image_base64: str, task: str) -> str:
    """
    Call Gemini Vision API synchronously to replicate Florence-2 /predict output.
    Returns a plain text string matching what Florence would return for the task.
    Raises HTTPException on hard failures.
    """
    import httpx as _httpx

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    model   = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite").strip()

    if not api_key:
        logger.error("GEMINI_API_KEY is not set but VISION_BACKEND=gemini")
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured.")

    # Detect MIME type from base64 header or default to JPEG
    mime_type = "image/jpeg"
    if image_base64.startswith("/9j/"):
        mime_type = "image/jpeg"
    elif image_base64.startswith("iVBORw0K"):
        mime_type = "image/png"
    elif image_base64.startswith("UklGR"):
        mime_type = "image/webp"

    prompt = _GEMINI_PROMPTS.get(task, _DEFAULT_GEMINI_PROMPT)
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    payload = {
        "contents": [{
            "role": "user",
            "parts": [
                {"text": prompt},
                {"inline_data": {"mime_type": mime_type, "data": image_base64}},
            ],
        }],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 512},
    }

    try:
        with _httpx.Client(timeout=30.0) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            result = (
                data.get("candidates", [{}])[0]
                    .get("content", {})
                    .get("parts", [{}])[0]
                    .get("text", "")
                    .strip()
            )
            if not result:
                logger.warning("Gemini returned empty vision result")
            return result
    except _httpx.HTTPStatusError as exc:
        logger.error("Gemini Vision HTTP error", extra={"status": exc.response.status_code})
        raise HTTPException(status_code=502, detail=f"Gemini Vision API error: {exc.response.status_code}")
    except Exception as exc:
        logger.error("Gemini Vision unexpected error", extra={"error": str(exc)})
        raise HTTPException(status_code=502, detail=f"Gemini Vision failed: {exc}")


@app.get("/health")
def health():
    logger.info("Florence health check requested")
    backend = os.environ.get("VISION_BACKEND", "florence").lower()
    return {"status": "ok", "model": MODEL_ID if backend != "gemini" else os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite"), "device": _state.device, "backend": backend}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    started_at = time.perf_counter()
    logger.info(
        "Incoming Florence inference request",
        extra={"task": req.task, "image_bytes": len(req.image_base64)},
    )

    # ── Gemini Vision path (production) ───────────────────────────────────────
    backend = os.environ.get("VISION_BACKEND", "florence").lower()
    if backend == "gemini":
        result_text = _gemini_predict(req.image_base64, req.task)
        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        logger.info(
            "Gemini vision completed",
            extra={"task": req.task, "duration_ms": duration_ms, "result_length": len(result_text)},
        )
        return PredictResponse(result=result_text, task=req.task)

    # ── Florence local model path (development) ───────────────────────────────
    if _state.model is None:
        logger.error("Florence inference requested before model is loaded")
        raise HTTPException(status_code=503, detail="Model not loaded yet")

    # Decode image
    try:
        image_bytes = base64.b64decode(req.image_base64)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:
        logger.error("Florence image decode failed", extra={"error": str(exc)})
        raise HTTPException(status_code=400, detail=f"Invalid image: {exc}")

    # Run inference
    try:
        assert _state.processor is not None and _state.model is not None
        logger.info(
            "Running Florence inference",
            extra={"task": req.task, "image_size": f"{image.width}x{image.height}"},
        )
        inputs = _state.processor(  # type: ignore
            text=req.task,
            images=image,
            return_tensors="pt",
        ).to(_state.device)
        
        inputs["pixel_values"] = inputs["pixel_values"].to(_state.model.dtype)

        with torch.no_grad():
            generated_ids = _state.model.generate(
                input_ids=inputs["input_ids"],
                pixel_values=inputs["pixel_values"],
                max_new_tokens=512,
                early_stopping=False,
                do_sample=False,
                num_beams=3,
            )

        if hasattr(_state.processor, "batch_decode"):
            generated_text = _state.processor.batch_decode(
                generated_ids, skip_special_tokens=False
            )[0]
        else:
            generated_text = _state.processor.tokenizer.batch_decode(  # type: ignore
                generated_ids, skip_special_tokens=False
            )[0]

        parsed = _state.processor.post_process_generation(  # type: ignore
            generated_text,
            task=req.task,
            image_size=(image.width, image.height),
        )

        raw = parsed.get(req.task, "")
        # Some tasks return dict (region tasks), others return str
        if isinstance(raw, dict):
            result_text = raw.get("text", "") or str(raw)
        else:
            result_text = str(raw)

    except Exception as exc:
        import traceback
        traceback.print_exc()
        logger.error("Florence inference failed", extra={"error": str(exc), "task": req.task})
        raise HTTPException(status_code=500, detail=f"Inference error: {exc}")

    duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
    logger.info(
        "Florence inference completed",
        extra={"task": req.task, "duration_ms": duration_ms, "result_length": len(result_text)},
    )
    return PredictResponse(result=result_text, task=req.task)


if __name__ == "__main__":
    import os
    import uvicorn
    uvicorn.run(
        app,
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8002")),
        log_level="info",
    )
