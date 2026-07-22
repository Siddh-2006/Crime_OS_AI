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
from app.core.logging import logger
from app.image_worker.interfaces import ITextDetector

# Text is considered present if Florence returns more than this many characters
_TEXT_PRESENCE_THRESHOLD = 5
_MAX_RETRIES = 3


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
                # Non-retryable: Florence returned an error response
                logger.error(
                    "Florence text detection HTTP error",
                    extra={"status": exc.response.status_code, "error": str(exc)},
                )
                raise

        logger.error(
            "Florence text detection failed after max retries",
            extra={"retries": _MAX_RETRIES, "error": str(last_exc)},
        )
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
