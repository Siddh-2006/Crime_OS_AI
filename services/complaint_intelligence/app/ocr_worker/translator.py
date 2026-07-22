"""M5 OCR Worker — Translation Engine.

Implements ITranslationEngine using deep_translator (Google Translate backend,
no API key required). Falls back gracefully if translation fails.
"""
from __future__ import annotations

import re

from app.core.logging import logger
from app.ocr_worker.interfaces import ITranslationEngine

_NON_ENGLISH = re.compile(r"[^\x00-\x7F]")   # quick heuristic for non-ASCII


class DeepTranslator(ITranslationEngine):
    """
    Translation engine backed by deep_translator (free, no API key).
    Translates any detected language to English.
    Falls back to returning original text if translation fails.
    """

    async def detect_language(self, text: str) -> str:
        if not text or not text.strip():
            return "en"
        # Fast heuristic — if all ASCII, skip langdetect
        if not _NON_ENGLISH.search(text):
            return "en"
        try:
            from langdetect import detect
            lang = detect(text)
            logger.info("[translator] Language detected", extra={"lang": lang})
            return lang
        except Exception as exc:
            logger.warning("[translator] Language detection failed", extra={"error": str(exc)})
            return "unknown"

    async def translate(self, text: str, source_lang: str) -> str:
        if source_lang in ("en", "unknown") or not text.strip():
            return text
        try:
            from deep_translator import GoogleTranslator
            # deep_translator accepts max ~5000 chars per call — chunk if needed
            chunks = self._chunk(text, max_chars=4500)
            translated_chunks = []
            for chunk in chunks:
                result = GoogleTranslator(
                    source=source_lang, target="en"
                ).translate(chunk)
                translated_chunks.append(result or chunk)
            translated = "\n".join(translated_chunks)
            logger.info(
                "[translator] Translation completed",
                extra={"source_lang": source_lang, "original_len": len(text), "translated_len": len(translated)},
            )
            return translated
        except Exception as exc:
            logger.warning("[translator] Translation failed, returning original", extra={"error": str(exc)})
            return text

    @staticmethod
    def _chunk(text: str, max_chars: int) -> list[str]:
        """Split text into chunks of at most max_chars characters."""
        if len(text) <= max_chars:
            return [text]
        chunks, current = [], []
        current_len = 0
        for line in text.splitlines(keepends=True):
            if current_len + len(line) > max_chars and current:
                chunks.append("".join(current))
                current, current_len = [], 0
            current.append(line)
            current_len += len(line)
        if current:
            chunks.append("".join(current))
        return chunks


class NoOpTranslator(ITranslationEngine):
    """Pass-through translator for testing or when translation is disabled."""

    async def detect_language(self, text: str) -> str:
        return "en"

    async def translate(self, text: str, source_lang: str) -> str:
        return text
