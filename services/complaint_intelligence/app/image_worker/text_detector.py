"""
Text Detectors — determine whether readable text exists in an image.

FlorenceTextDetector: calls Florence-2 REST with task=<OCR>.
  Returns True if the response contains text (length > threshold).
  Does NOT return the text — that is Milestone 5 / PaddleOCR's job.
  Retries up to 3x on transient failures (timeout, connection error).

MockTextDetector: returns a configurable bool for unit tests.
"""
from __future__ import annotations

import base64

import httpx

from app.core.config import settings
from app.core.exceptions import LLMError
from app.core.logging import logger
from app.image_worker.captioner import _guess_image_mime_type
from app.image_worker.interfaces import ITextDetector

# Text is considered present if Florence returns more than this many characters
_TEXT_PRESENCE_THRESHOLD = 5
_MAX_RETRIES = 3


async def detect_text_with_gemini(image_bytes: bytes, timeout: int | None = None) -> bool:
    """Use Gemini vision to decide whether readable text is visible in an image."""
    api_key = settings.GEMINI_API_KEY.strip()
    if not api_key:
        raise LLMError("GEMINI_API_KEY is not set. Add it to the complaint-intelligence .env file to enable Gemini fallback.")

    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent?key={api_key}"
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": (
                            "Does this image contain readable text, printed words, handwriting, "
                            "a form, document, receipt, screenshot text, or signage? Return only true or false."
                        )
                    },
                    {
                        "inline_data": {
                            "mime_type": _guess_image_mime_type(image_bytes),
                            "data": image_b64,
                        }
                    },
                ],
            }
        ],
        "generationConfig": {"temperature": 0.0},
    }

    try:
        async with httpx.AsyncClient(timeout=timeout or settings.FLORENCE_TIMEOUT_SECONDS) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            text = (
                resp.json()
                .get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
                .strip()
                .lower()
            )
            if text.startswith("true"):
                return True
            if text.startswith("false"):
                return False
            raise LLMError(f"Gemini returned an invalid text-detection response: {text[:80]}")
    except httpx.HTTPStatusError as exc:
        raise LLMError(f"Gemini vision API returned error status: {exc.response.status_code}") from exc
    except httpx.RequestError as exc:
        raise LLMError(f"Failed to communicate with Gemini vision: {exc}") from exc


class FlorenceTextDetector(ITextDetector):
    """
    Real text presence detector that uses Florence-2's <OCR> task.
    Returns True/False only — the actual text content is discarded.

    Retry policy: up to 3x on httpx.TimeoutException or httpx.ConnectError.
    Does NOT retry on non-2xx responses (treated as Florence logic error).
    """

    def __init__(
        self,
        base_url: str | None = None,
        timeout: int | None = None,
    ) -> None:
        self._base_url = (base_url or settings.FLORENCE_BASE_URL).rstrip("/")
        self._timeout = timeout or settings.FLORENCE_TIMEOUT_SECONDS

    async def detect(self, image_bytes: bytes) -> bool:
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")
        payload = {"image_base64": image_b64, "task": "<OCR>"}

        last_exc: Exception | None = None
        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    resp = await client.post(f"{self._base_url}/predict", json=payload)
                    resp.raise_for_status()
                    data = resp.json()
                    text_output: str = data.get("result", "") or ""
                    has_text = len(text_output.strip()) > _TEXT_PRESENCE_THRESHOLD
                    logger.debug(
                        "Florence text detection completed",
                        extra={"has_text": has_text, "ocr_length": len(text_output)},
                    )
                    return has_text

            except (httpx.TimeoutException, httpx.ConnectError) as exc:
                last_exc = exc
                logger.warning(
                    "Florence text detection transient failure, retrying",
                    extra={"attempt": attempt, "error": str(exc)},
                )
            except httpx.HTTPStatusError as exc:
                last_exc = exc
                logger.error(
                    "Florence text detection HTTP error",
                    extra={"attempt": attempt, "status": exc.response.status_code, "error": str(exc)},
                )
                if exc.response.status_code not in {404, 408, 425, 429, 500, 502, 503, 504}:
                    raise

        logger.error(
            "Florence text detection failed after max retries",
            extra={"retries": _MAX_RETRIES, "error": str(last_exc)},
        )
        if settings.GEMINI_API_KEY.strip():
            logger.warning("Falling back to Gemini vision for text detection")
            return await detect_text_with_gemini(image_bytes, timeout=self._timeout)
        logger.warning("Gemini vision fallback skipped because GEMINI_API_KEY is not configured")
        raise last_exc  # type: ignore[misc]


class MockTextDetector(ITextDetector):
    """
    Deterministic mock for unit tests.
    Returns configured bool regardless of image content.
    """

    def __init__(self, returns: bool = False) -> None:
        self._returns = returns

    async def detect(self, image_bytes: bytes) -> bool:
        return self._returns
