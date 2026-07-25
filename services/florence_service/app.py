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

import base64
import io
import logging
import sys
import time
import types

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
# Use setattr for dynamic attrs — avoids type checker 'no attribute' errors
setattr(_fa_stub, "flash_attn_func", None)
setattr(_fa_stub, "flash_attn_varlen_func", None)
sys.modules.setdefault("flash_attn", _fa_stub)
sys.modules.setdefault("flash_attn.flash_attn_interface", _fa_stub)

import transformers.utils.import_utils as _tiu
_tiu.is_flash_attn_2_available = lambda: False
_tiu.is_flash_attn_greater_or_equal_2_10 = lambda: False


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
    load_model()
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


@app.get("/health")
def health():
    logger.info("Florence health check requested")
    return {"status": "ok", "model": MODEL_ID, "device": _state.device}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    started_at = time.perf_counter()
    logger.info(
        "Incoming Florence inference request",
        extra={"task": req.task, "image_bytes": len(req.image_base64)},
    )

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
        inputs = _state.processor(
            text=req.task,
            images=image,
            return_tensors="pt",
        ).to(_state.device)

        with torch.no_grad():
            generated_ids = _state.model.generate(
                input_ids=inputs["input_ids"],
                pixel_values=inputs["pixel_values"],
                max_new_tokens=512,
                early_stopping=False,
                do_sample=False,
                num_beams=3,
            )

        generated_text = _state.processor.batch_decode(
            generated_ids, skip_special_tokens=False
        )[0]

        parsed = _state.processor.post_process_generation(
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
        logger.error("Florence inference failed", extra={"error": str(exc), "task": req.task})
        raise HTTPException(status_code=500, detail=f"Inference error: {exc}")

    duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
    logger.info(
        "Florence inference completed",
        extra={"task": req.task, "duration_ms": duration_ms, "result_length": len(result_text)},
    )
    return PredictResponse(result=result_text, task=req.task)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002, log_level="info")
