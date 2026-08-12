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
