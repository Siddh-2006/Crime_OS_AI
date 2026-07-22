"""
Interfaces for the Image Worker pipeline.

Six single-responsibility ABCs — business logic depends ONLY on these.
Concrete implementations (PIL, Florence REST, etc.) are never imported directly.

IMetadataExtractor  — extract image properties deterministically
IImagePreprocessor  — orientation fix + resize (no AI)
ITextDetector       — detect text presence (NOT extraction)
IImageCaptioner     — Florence-2 structured captioning
IEvidenceBuilder    — construct EvidenceProfile from parts
IImageWorker        — top-level worker contract
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from app.schemas.evidence import (
    EvidenceProfile,
    ImageAnalysisResult,
    ImageMetadata,
)


class IMetadataExtractor(ABC):
    """Extract deterministic image metadata using Pillow. No AI."""

    @abstractmethod
    def extract(self, image_bytes: bytes, file_name: str, file_size_bytes: int) -> ImageMetadata:
        """
        Parse image bytes and return typed metadata.
        Raises InvalidImageError on corrupt/unreadable images.
        Raises UnsupportedFormatError on unsupported formats.
        """
        ...


class IImagePreprocessor(ABC):
    """Preprocess image for AI inference: orientation correction and resize."""

    @abstractmethod
    def preprocess(self, image_bytes: bytes) -> bytes:
        """
        Correct EXIF orientation, convert to RGB, resize to model limits.
        Returns JPEG bytes ready for Florence inference.
        """
        ...


class ITextDetector(ABC):
    """
    Detect whether readable text exists in an image.
    Must NOT perform OCR — only returns a boolean.
    """

    @abstractmethod
    async def detect(self, image_bytes: bytes) -> bool:
        """Return True if readable text is present, False otherwise."""
        ...


class IImageCaptioner(ABC):
    """
    Generate structured image understanding via Florence-2.
    Raw model output is NEVER returned — always converted to ImageAnalysisResult.
    """

    @abstractmethod
    async def caption(self, image_bytes: bytes) -> ImageAnalysisResult:
        """Analyse image and return a strongly typed ImageAnalysisResult."""
        ...


class IEvidenceBuilder(ABC):
    """
    Construct an EvidenceProfile from its component parts.
    The Image Worker orchestrates; the builder assembles.
    """

    @abstractmethod
    def build(
        self,
        *,
        file_name: str,
        metadata: ImageMetadata | None,
        analysis: ImageAnalysisResult | None,
        text_detected: bool,
        ocr_job_id: str | None,
        status: str,
        processing_duration_ms: float,
    ) -> EvidenceProfile:
        """Assemble and return a validated EvidenceProfile."""
        ...


class IImageWorker(ABC):
    """Top-level image worker contract."""

    @abstractmethod
    async def process(self, *, job_id: str, payload: dict, attempt: int) -> dict:
        """Run the full image processing pipeline and return EvidenceProfile as dict."""
        ...
