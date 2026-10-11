"""M5 OCR Worker — PaddleOCR Engine.

Implements IOCREngine. Runs PaddleOCR on image bytes and converts the output
to strongly-typed OCRResult. No PaddleOCR types ever leave this module.

Compatible with PaddleOCR 3.x (new predict() API).
Falls back to GeminiOCREngine if PaddleOCR fails.
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
        # PaddleOCR v3 constructor — no use_angle_cls, use_gpu params
        try:
            ocr = PaddleOCR(lang=_PADDLE_LANG)
        except Exception as e:
            logger.warning(f"[paddle_ocr] PaddleOCR init failed: {e}")
            return None
        logger.info("[paddle_ocr] PaddleOCR model loaded")
        return ocr
    except Exception as exc:
        logger.warning("[paddle_ocr] PaddleOCR import/initialization failed; falling back to vision captions", extra={"error": str(exc)})
        return None


def _run_paddle(image_bytes: bytes) -> list:
    """Run PaddleOCR v3 and return raw result list."""
    ocr = _get_ocr()
    if ocr is None:
        return []
    import numpy as np
    from PIL import Image
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_array = np.array(img)

    # PaddleOCR v3 uses predict() instead of ocr()
    try:
        results = ocr.predict(img_array)
    except TypeError:
        # If predict() is not available, fall back to ocr() without cls kwarg
        results = ocr.ocr(img_array)

    if not results:
        return []

    # v3 returns a list of dicts per page: [{'rec_texts': [...], 'rec_scores': [...], 'rec_polys': [...]}]
    # v2 returns: [[ [[box], (text, score)], ... ]]
    page = results[0] if results else {}

    # Detect v3 format (dict with rec_texts)
    if isinstance(page, dict) and 'rec_texts' in page:
        return _normalize_v3_result(page)

    # v2 format — list of [box, (text, score)]
    if isinstance(page, list):
        return page

    return []


def _normalize_v3_result(page: dict) -> list:
    """Convert PaddleOCR v3 dict format to the v2-compatible list format."""
    texts  = page.get('rec_texts', [])
    scores = page.get('rec_scores', [])
    polys  = page.get('rec_polys', [])

    result = []
    for i, text in enumerate(texts):
        score = scores[i] if i < len(scores) else 0.9
        poly  = polys[i]  if i < len(polys)  else [[0,0],[1,0],[1,1],[0,1]]
        # Convert poly to the 4-point format PaddleOCR v2 used
        points = [[int(p[0]), int(p[1])] for p in poly[:4]]
        result.append([points, (text, float(score))])
    return result


def _parse_paddle_result(raw: list, duration_ms: float) -> OCRResult:
    """Convert raw PaddleOCR output → OCRResult.

    Supports both v2 format:
        [[[x1,y1],[x2,y1],[x2,y2],[x1,y2]], (text, confidence)]
    and the normalized v3 format (already converted by _normalize_v3_result).
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
    """PaddleOCR engine — supports both v2 and v3, lazy-loaded and cached per process."""

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
        api_keys_str = os.environ.get("GEMINI_API_KEY", "").strip()
        self._api_keys = [k.strip() for k in api_keys_str.split(",") if k.strip()]
        self._model   = os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-lite").strip()
        if not self._api_keys:
            logger.warning("[gemini_ocr] GEMINI_API_KEY not set — OCR calls will return empty results")

    async def run(self, image_bytes: bytes) -> OCRResult:
        import base64
        import httpx

        logger.info("[gemini_ocr] Starting OCR inference")
        t0 = time.monotonic()

        if not self._api_keys:
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

        import asyncio
        raw_text = ""
        last_exc = None
        for api_key in self._api_keys:
            _hdrs = {}
            if api_key.startswith("AQ."):
                _hdrs["Authorization"] = f"Bearer {api_key}"
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{self._model}:generateContent"
            else:
                url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
                       f"{self._model}:generateContent?key={api_key}")
            for attempt in range(3):
                try:
                    async with httpx.AsyncClient(timeout=30.0) as client:
                        resp = await client.post(url, json=payload, headers=_hdrs)
                        resp.raise_for_status()
                        data = resp.json()
                        raw_text = (
                            data.get("candidates", [{}])[0]
                                .get("content", {})
                                .get("parts", [{}])[0]
                                .get("text", "")
                                .strip()
                        )
                        break # Success
                except httpx.HTTPStatusError as exc:
                    last_exc = exc
                    if exc.response.status_code in (429, 503):
                        await asyncio.sleep(4 + (attempt * 2))
                        continue
                    if exc.response.status_code in (403, 500):
                        break # try next key
                    break # unrecoverable
                except Exception as exc:
                    last_exc = exc
                    if attempt < 2:
                        await asyncio.sleep(4 + (attempt * 2))
                        continue
                    break
            if raw_text:
                break

        if not raw_text and last_exc is not None:
            logger.warning("[gemini_ocr] API call failed on all keys", extra={"error": str(last_exc)})

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
