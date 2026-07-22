"""
FlorenceLocalCaptioner — runs Florence-2 directly in-process via HuggingFace transformers.

Uses: microsoft/Florence-2-base (CPU-friendly, ~450MB)
No REST service needed. Model is downloaded once and cached by HuggingFace.

Drop-in replacement for FlorenceCaptioner (same IImageCaptioner interface).
Business layer receives only ImageAnalysisResult — never raw model output.
"""
from __future__ import annotations

import io
import re
import sys
import types
from functools import lru_cache
from typing import Any

# Patch flash_attn check before any transformers model code can run
import transformers.utils.import_utils as _tiu
_tiu.is_flash_attn_2_available = lambda: False
_tiu.is_flash_attn_greater_or_equal_2_10 = lambda: False

from app.core.logging import logger
from app.image_worker.captioner import _parse_caption
from app.image_worker.interfaces import IImageCaptioner
from app.schemas.evidence import ImageAnalysisResult

MODEL_ID = "microsoft/Florence-2-base"


@lru_cache(maxsize=1)
def _load_model():
    """Lazy-load Florence-2 once. Cached across all calls in the process."""
    from transformers import AutoModelForCausalLM, AutoProcessor
    import torch

    logger.info("Loading Florence-2-base model (first use — may take a moment)")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32

    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        torch_dtype=dtype,
        trust_remote_code=True,
    ).to(device)
    processor = AutoProcessor.from_pretrained(MODEL_ID, trust_remote_code=True)
    logger.info("Florence-2-base loaded", extra={"device": device})
    return model, processor, device


def _run_task(image_pil, task: str) -> str:
    """Run a Florence-2 task and return the raw text result."""
    import torch

    model, processor, device = _load_model()
    inputs = processor(text=task, images=image_pil, return_tensors="pt").to(device)

    with torch.no_grad():
        generated_ids = model.generate(
            input_ids=inputs["input_ids"],
            pixel_values=inputs["pixel_values"],
            max_new_tokens=512,
            early_stopping=False,
            do_sample=False,
            num_beams=3,
        )

    generated_text = processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
    parsed = processor.post_process_generation(
        generated_text,
        task=task,
        image_size=(image_pil.width, image_pil.height),
    )
    result = parsed.get(task, "")
    # Result may be dict (for region tasks) or str (for caption/OCR)
    if isinstance(result, dict):
        return result.get("text", "") or str(result)
    return str(result)


class FlorenceLocalCaptioner(IImageCaptioner):
    """
    Real Florence-2 captioner that runs entirely in-process.
    No REST service needed — model loaded via HuggingFace transformers.

    Uses: microsoft/Florence-2-base
    Device: auto-detected (CUDA if available, else CPU)
    """

    async def caption(self, image_bytes: bytes) -> ImageAnalysisResult:
        from PIL import Image

        image_pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        logger.info("Florence-2 local inference started")

        # Task 1: detailed caption
        caption = _run_task(image_pil, "<MORE_DETAILED_CAPTION>")

        # Task 2: brief caption for scene type inference
        brief = _run_task(image_pil, "<CAPTION>")
        combined = f"{brief} {caption}".strip()

        result = _parse_caption(combined)
        logger.info(
            "Florence-2 local inference completed",
            extra={"scene_type": result.scene_type, "tags": result.tags, "caption": caption[:100]},
        )
        return result


class FlorenceLocalTextDetector:
    """
    Real text presence detector using Florence-2's <OCR> task.
    Returns True if the image contains readable text.
    Does NOT expose the OCR content (that is M5/PaddleOCR's job).
    """

    _TEXT_THRESHOLD = 5

    async def detect(self, image_bytes: bytes) -> bool:
        from PIL import Image

        image_pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        ocr_text = _run_task(image_pil, "<OCR>")
        has_text = len(ocr_text.strip()) > self._TEXT_THRESHOLD
        logger.info(
            "Florence-2 text detection completed",
            extra={"has_text": has_text, "ocr_length": len(ocr_text)},
        )
        return has_text
