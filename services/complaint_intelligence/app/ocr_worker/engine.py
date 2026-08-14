"""M5 OCR Worker — PaddleOCR Engine.

Implements IOCREngine. Runs PaddleOCR on image bytes and converts the output
to strongly-typed OCRResult. No PaddleOCR types ever leave this module.

Compatible with PaddleOCR 2.7.3 + PaddlePaddle 2.6.2 (stable Windows build).
"""
from __future__ import annotations

import io
import time
from functools import lru_cache

from app.core.logging import logger
from app.ocr_worker.interfaces import IOCREngine
from app.schemas.ocr import BoundingBox, OCRLine, OCRResult

_PADDLE_LANG = "en"   # Best for Indian+English mixed documents


@lru_cache(maxsize=1)
def _get_ocr():
    """Lazy-load PaddleOCR once, cached for the process lifetime."""
    logger.info("[paddle_ocr] Loading PaddleOCR model...")
    try:
        from paddleocr import PaddleOCR
        try:
            ocr = PaddleOCR(
                use_angle_cls=True,
                lang=_PADDLE_LANG,
                use_gpu=False,
            )
        except Exception:
            ocr = PaddleOCR(lang=_PADDLE_LANG)
        logger.info("[paddle_ocr] PaddleOCR model loaded")
        return ocr
    except Exception as exc:
        logger.warning("[paddle_ocr] PaddleOCR import/initialization failed; falling back to vision captions", extra={"error": str(exc)})
        return None


def _run_paddle(image_bytes: bytes) -> list:
    """Run PaddleOCR and return raw result list."""
    ocr = _get_ocr()
    if ocr is None:
        return []
    import numpy as np
    from PIL import Image
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    result = ocr.ocr(np.array(img), cls=True)
    if not result:
        return []
    page = result[0]
    return page if page else []


def _parse_paddle_result(raw: list, duration_ms: float) -> OCRResult:
    """Convert raw PaddleOCR 2.x output → OCRResult.

    PaddleOCR 2.x output per line:
        [[[x1,y1],[x2,y1],[x2,y2],[x1,y2]], (text, confidence)]
    """
    lines: list[OCRLine] = []
    for item in raw:
        if not item:
            continue
        try:
            points, (text, confidence) = item
            bbox = BoundingBox.from_paddle(points)
            lines.append(OCRLine(
                text=text.strip(),
                confidence=round(float(confidence), 4),
                bounding_box=bbox,
            ))
        except (ValueError, TypeError, IndexError):
            continue

    raw_text = "\n".join(ln.text for ln in lines if ln.text)
    word_count = sum(len(ln.text.split()) for ln in lines)
    avg_conf = round(sum(ln.confidence for ln in lines) / len(lines), 4) if lines else 0.0

    return OCRResult(
        raw_text=raw_text,
        lines=lines,
        word_count=word_count,
        line_count=len(lines),
        average_confidence=avg_conf,
        processing_duration_ms=round(duration_ms, 2),
    )


class PaddleOCREngine(IOCREngine):
    """Real PaddleOCR 2.7.3 engine — lazy-loaded, cached per process."""

    async def run(self, image_bytes: bytes) -> OCRResult:
        logger.info("[paddle_ocr] Starting OCR inference")
        t0 = time.monotonic()
        raw = _run_paddle(image_bytes)
        duration_ms = (time.monotonic() - t0) * 1000
        result = _parse_paddle_result(raw, duration_ms)
        logger.info(
            "[paddle_ocr] OCR completed",
            extra={"lines": result.line_count, "words": result.word_count,
                   "avg_confidence": result.average_confidence, "duration_ms": result.processing_duration_ms},
        )
        return result


class GeminiOCREngine(IOCREngine):
    """
    Production OCR engine backed by Gemini Vision API.
    Used when APP_ENV=production — no PaddleOCR or GPU needed.
    Uses raw httpx (already in requirements) — no extra dependency.

    Prompt: extract all visible text verbatim, one item per line.
    Returns the same OCRResult interface as PaddleOCREngine.
    """

    def __init__(self) -> None:
        import os
        self._api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        self._model   = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite").strip()
        if not self._api_key:
            logger.warning("[gemini_ocr] GEMINI_API_KEY not set — OCR calls will return empty results")

    async def run(self, image_bytes: bytes) -> OCRResult:
        import base64
        import httpx

        logger.info("[gemini_ocr] Starting OCR inference")
        t0 = time.monotonic()

        if not self._api_key:
            return OCRResult(raw_text="", lines=[], word_count=0,
                             line_count=0, average_confidence=0.0,
                             processing_duration_ms=0.0)

        # Detect MIME type from magic bytes
        mime = "image/jpeg"
        if image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
            mime = "image/png"
        elif image_bytes[:4] == b"RIFF":
            mime = "image/webp"

        b64 = base64.b64encode(image_bytes).decode()
        url  = (f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{self._model}:generateContent?key={self._api_key}")
        payload = {
            "contents": [{
                "role": "user",
                "parts": [
                    {"text": (
                        "Extract all text visible in this image exactly as written. "
                        "Output each distinct text element on its own line. "
                        "Preserve the original reading order. "
                        "If no readable text is present output an empty string. "
                        "Output only the extracted text, nothing else."
                    )},
                    {"inline_data": {"mime_type": mime, "data": b64}},
                ],
            }],
            "generationConfig": {"temperature": 0.0, "maxOutputTokens": 1024},
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                data = resp.json()
                raw_text = (
                    data.get("candidates", [{}])[0]
                        .get("content", {})
                        .get("parts", [{}])[0]
                        .get("text", "")
                        .strip()
                )
        except Exception as exc:
            logger.warning("[gemini_ocr] API call failed", extra={"error": str(exc)})
            raw_text = ""

        duration_ms = (time.monotonic() - t0) * 1000

        # Convert plain text to OCRResult (no bounding boxes — Gemini doesn't return them)
        lines_text = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
        ocr_lines = [
            OCRLine(text=ln, confidence=0.95, bounding_box=BoundingBox(x=0, y=0, width=0, height=0))
            for ln in lines_text
        ]
        word_count = sum(len(ln.split()) for ln in lines_text)

        result = OCRResult(
            raw_text=raw_text,
            lines=ocr_lines,
            word_count=word_count,
            line_count=len(ocr_lines),
            average_confidence=0.95 if ocr_lines else 0.0,
            processing_duration_ms=round(duration_ms, 2),
        )
        logger.info(
            "[gemini_ocr] OCR completed",
            extra={"lines": result.line_count, "words": result.word_count,
                   "duration_ms": result.processing_duration_ms},
        )
        return result
