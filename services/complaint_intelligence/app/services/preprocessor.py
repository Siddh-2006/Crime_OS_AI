import re
import unicodedata
from typing import Dict, Any, Optional
from langdetect import detect_langs
from app.core.logging import logger
from app.core.exceptions import PreprocessingError


class ComplaintPreprocessor:
    """
    Handles cleaning, language detection, translation hooks, and normalization
    for complaint narrative text.
    """

    def clean_text(self, text: str) -> str:
        """
        Cleans complaint text:
        1. Removes HTML tags.
        2. Normalizes line endings and whitespace.
        3. Removes non-printable/control characters.
        """
        if not text:
            return ""

        # Remove HTML tags
        text = re.sub(r"<[^>]*>", " ", text)

        # Normalize unicode format (NFKC)
        text = unicodedata.normalize("NFKC", text)

        # Remove control characters (except newline and tab)
        text = "".join(ch for ch in text if unicodedata.category(ch)[0] != "C" or ch in "\n\t")

        # Replace multiple spaces with a single space, preserving single newlines
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n\s*\n+", "\n\n", text)  # normalize multi-newlines

        return text.strip()

    def detect_language(self, text: str) -> str:
        """
        Detects text language, restricting output to 'en', 'hi', or 'gu'.
        Falls back to Unicode-block matching and English fallback if classification fails.
        """
        if not text or len(text.strip()) < 10:
            return "en"

        try:
            predictions = detect_langs(text)
            valid_langs = {"en", "hi", "gu"}
            filtered = [p for p in predictions if p.lang in valid_langs]
            if filtered:
                filtered.sort(key=lambda x: x.prob, reverse=True)
                detected = filtered[0].lang
                logger.info(
                    "Language detected successfully from restricted set",
                    extra={"detected_language": detected, "probabilities": str(filtered)}
                )
                return detected

            # Fallback to Unicode block detection if langdetect fails to list en, hi, or gu.
            # Gujarati unicode block: U+0A80 to U+0AFF
            # Devanagari (Hindi) unicode block: U+0900 to U+097F
            has_gujarati = any(0x0A80 <= ord(char) <= 0x0AFF for char in text)
            has_hindi = any(0x0900 <= ord(char) <= 0x097F for char in text)

            if has_gujarati:
                logger.info("Unicode fallback detected Gujarati script")
                return "gu"
            elif has_hindi:
                logger.info("Unicode fallback detected Hindi/Devanagari script")
                return "hi"

            logger.info("No matching language found in restricted set, defaulting to 'en'")
            return "en"
        except Exception as exc:
            logger.warning(
                "Language detection failed, falling back to 'en'",
                extra={"error": str(exc)}
            )
            return "en"

    def translate_hook(self, text: str, source_lang: str) -> str:
        """
        Placeholder hook for translating Gujarati or Hindi into English.
        """
        if source_lang == "en":
            return text

        logger.info(
            "Translation hook triggered (mocked for Phase 2)",
            extra={"source_language": source_lang}
        )
        # Placeholder for translation logic.
        # We can implement a placeholder prefix or just pass the text back.
        return text

    def normalize_text(self, text: str) -> str:
        """
        Normalizes text (converting to lowercase for matching, stripping accents, etc.).
        """
        if not text:
            return ""

        # Normalize to NFD to separate accents from base characters
        nfd_form = unicodedata.normalize("NFD", text)
        # Strip accents
        stripped = "".join(c for c in nfd_form if not unicodedata.combining(c))

        return stripped.strip()

    def preprocess(self, text: str) -> Dict[str, Any]:
        """
        Executes the full preprocessing pipeline on the narrative text.
        """
        try:
            logger.info("Starting preprocessing pipeline on complaint text")
            
            cleaned = self.clean_text(text)
            detected_lang = self.detect_language(cleaned)
            translated = self.translate_hook(cleaned, detected_lang)
            normalized = self.normalize_text(translated)

            return {
                "original_text": text,
                "cleaned_text": cleaned,
                "detected_language": detected_lang,
                "translated_text": translated,
                "normalized_text": normalized
            }
        except Exception as exc:
            logger.error("Preprocessing pipeline failed", exc_info=True)
            raise PreprocessingError(f"Failed to preprocess text: {str(exc)}")
