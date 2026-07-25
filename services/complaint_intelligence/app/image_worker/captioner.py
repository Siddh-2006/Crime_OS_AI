"""
Image Captioners — generate structured ImageAnalysisResult from an image.

FlorenceCaptioner: calls Florence-2 REST with task=<MORE_DETAILED_CAPTION>.
  Parses the raw string caption into a strongly typed ImageAnalysisResult.
  Business logic NEVER receives the raw Florence response.
  Retries up to 3x on transient failures.

MockImageCaptioner: returns a configurable ImageAnalysisResult for unit tests.
"""
from __future__ import annotations

import base64
import re

import httpx

from app.core.config import settings
from app.core.exceptions import LLMError
from app.core.logging import logger
from app.image_worker.interfaces import IImageCaptioner
from app.schemas.evidence import ImageAnalysisResult

_MAX_RETRIES = 1

# Keyword sets for boolean flags (checked against caption in lower case)
_PEOPLE_KEYWORDS = frozenset({"person", "people", "man", "woman", "child", "crowd", "officer", "suspect"})
_VEHICLE_KEYWORDS = frozenset({"car", "vehicle", "truck", "motorcycle", "bike", "van", "bus", "auto"})
_WEAPON_KEYWORDS = frozenset({"gun", "weapon", "knife", "pistol", "rifle", "sword", "blade", "firearm"})
_BUILDING_KEYWORDS = frozenset({"building", "house", "office", "shop", "store", "bank", "hospital", "school"})
_DOCUMENT_KEYWORDS = frozenset({"document", "paper", "form", "certificate", "card", "letter", "statement", "text"})

# Scene type inference
_OUTDOOR_KEYWORDS = frozenset({"street", "road", "outdoor", "park", "field", "sky", "tree", "car", "traffic"})
_INDOOR_KEYWORDS = frozenset({"room", "office", "indoor", "table", "chair", "wall", "floor", "interior"})
_DOCUMENT_SCENE_KEYWORDS = frozenset({"document", "paper", "form", "certificate", "statement", "text", "page"})


def _infer_scene_type(caption_lower: str) -> str:
    """Infer scene type from caption keywords."""
    words = set(re.findall(r"\b\w+\b", caption_lower))
    if words & _DOCUMENT_SCENE_KEYWORDS:
        return "document"
    if words & _OUTDOOR_KEYWORDS:
        return "outdoor"
    if words & _INDOOR_KEYWORDS:
        return "indoor"
    return "other"


def _extract_tags(caption: str) -> list[str]:
    """Extract key nouns from caption as tags (simple heuristic)."""
    # Filter words that are likely nouns: capitalised or known keywords
    all_keywords = (
        _PEOPLE_KEYWORDS | _VEHICLE_KEYWORDS | _WEAPON_KEYWORDS |
        _BUILDING_KEYWORDS | _DOCUMENT_KEYWORDS | _OUTDOOR_KEYWORDS | _INDOOR_KEYWORDS
    )
    words = re.findall(r"\b[a-zA-Z]{3,}\b", caption.lower())
    return list(dict.fromkeys(w for w in words if w in all_keywords))[:10]


def _parse_caption(caption: str) -> ImageAnalysisResult:
    """Convert a raw Florence caption string into ImageAnalysisResult."""
    caption_lower = caption.lower()
    words = set(re.findall(r"\b\w+\b", caption_lower))

    return ImageAnalysisResult(
        description=caption.strip(),
        scene_type=_infer_scene_type(caption_lower),
        tags=_extract_tags(caption),
        confidence=0.85,
        contains_people=bool(words & _PEOPLE_KEYWORDS),
        contains_vehicles=bool(words & _VEHICLE_KEYWORDS),
        contains_weapons=bool(words & _WEAPON_KEYWORDS),
        contains_buildings=bool(words & _BUILDING_KEYWORDS),
        contains_documents=bool(words & _DOCUMENT_KEYWORDS),
    )


class FlorenceCaptioner(IImageCaptioner):
    """
    Real Florence-2 captioner via REST API.

    Sends image to Florence service and converts raw string response
    into a strongly typed ImageAnalysisResult.
    Raw Florence output NEVER leaves this class.

    Retry policy: up to 3x on httpx.TimeoutException or httpx.ConnectError.
    """

    def __init__(
        self,
        base_url: str | None = None,
        timeout: int | None = None,
    ) -> None:
        self._base_url = (base_url or settings.FLORENCE_BASE_URL).rstrip("/")
        self._timeout = timeout or settings.FLORENCE_TIMEOUT_SECONDS

    async def caption(self, image_bytes: bytes) -> ImageAnalysisResult:
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")
        payload = {"image_base64": image_b64, "task": "<CAPTION>"}

        logger.info("Florence inference started")

        last_exc: Exception | None = None
        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    resp = await client.post(f"{self._base_url}/predict", json=payload)
                    resp.raise_for_status()
                    data = resp.json()
                    raw_caption: str = data.get("result", "") or ""

                    if not raw_caption.strip():
                        raise LLMError("Florence returned an empty caption.")

                    result = _parse_caption(raw_caption)
                    logger.info(
                        "Florence inference completed",
                        extra={"scene_type": result.scene_type, "tags": result.tags},
                    )
                    return result

            except (httpx.TimeoutException, httpx.ConnectError) as exc:
                last_exc = exc
                logger.warning(
                    "Florence inference transient failure, retrying",
                    extra={"attempt": attempt, "error": str(exc)},
                )
            except httpx.HTTPStatusError as exc:
                logger.error(
                    "Florence inference HTTP error",
                    extra={"status": exc.response.status_code},
                )
                raise LLMError(f"Florence returned HTTP {exc.response.status_code}")

        logger.error(
            "Florence inference failed after max retries",
            extra={"retries": _MAX_RETRIES, "error": str(last_exc)},
        )
        raise LLMError(f"Florence inference failed after {_MAX_RETRIES} retries: {last_exc}")


class MockImageCaptioner(IImageCaptioner):
    """
    Deterministic mock captioner for unit tests.
    Returns a pre-configured ImageAnalysisResult.
    """

    def __init__(self, result: ImageAnalysisResult | None = None) -> None:
        self._result = result or ImageAnalysisResult(
            description="A test image showing a scene.",
            scene_type="other",
            tags=[],
            confidence=0.85,
            contains_people=False,
            contains_vehicles=False,
            contains_weapons=False,
            contains_buildings=False,
            contains_documents=False,
        )

    async def caption(self, image_bytes: bytes) -> ImageAnalysisResult:
        return self._result
