"""M5 OCR Worker — Interfaces.

Business logic NEVER imports PaddleOCR, deep_translator, or any AI directly.
All external dependencies are injected through these ABCs.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Protocol

from app.schemas.ocr import OCRResult


class IOCREngine(ABC):
    """Runs OCR on raw image bytes. Returns structured OCRResult."""

    @abstractmethod
    async def run(self, image_bytes: bytes) -> OCRResult:
        ...


class ITranslationEngine(ABC):
    """Translates text from any detected language to English."""

    @abstractmethod
    async def translate(self, text: str, source_lang: str) -> str:
        """Return English translation. If already English, return as-is."""
        ...

    @abstractmethod
    async def detect_language(self, text: str) -> str:
        """Return ISO 639-1 language code, e.g. 'en', 'gu', 'hi'."""
        ...


class IOCRWorker(ABC):
    """Orchestrates the full OCR pipeline for a queued job."""

    @abstractmethod
    async def process(self, job_id: str, payload: dict) -> dict:
        ...
