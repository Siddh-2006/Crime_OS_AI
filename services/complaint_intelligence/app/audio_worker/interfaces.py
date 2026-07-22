"""
Audio Worker interfaces — M6.

Every concrete implementation must satisfy these contracts.
Business logic depends ONLY on these interfaces, never on concrete classes.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from app.schemas.evidence import AudioMetadata, AudioTranscript


class IAudioTranscriber(ABC):
    """
    Transcribes audio bytes to a structured AudioTranscript.

    Responsibilities:
      - Detect language
      - Transcribe audio in the original language
      - Translate to English if language is non-English
      - Return a strongly typed AudioTranscript (never raw Whisper output)
    """

    @abstractmethod
    async def transcribe(self, audio_bytes: bytes) -> AudioTranscript:
        """
        Transcribe audio bytes and return a structured AudioTranscript.

        Args:
            audio_bytes: Raw audio file bytes (any supported format).

        Returns:
            AudioTranscript with detected language, raw text,
            optional English translation, and per-segment details.

        Raises:
            ValueError: If audio_bytes is empty or cannot be decoded.
        """
        ...


class IAudioMetadataExtractor(ABC):
    """
    Extracts deterministic audio metadata without AI.

    Responsibilities:
      - Read audio headers (duration, sample rate, channels, codec, bit rate)
      - Derive MIME type from content
      - Never use AI for metadata extraction
    """

    @abstractmethod
    def extract(
        self,
        audio_bytes: bytes,
        file_name: str,
        file_size_bytes: int,
    ) -> AudioMetadata:
        """
        Extract audio metadata from raw bytes.

        Args:
            audio_bytes:     Raw audio file bytes.
            file_name:       Original filename (used for MIME type hint).
            file_size_bytes: File size in bytes.

        Returns:
            AudioMetadata with duration, sample_rate, channels, codec, etc.

        Raises:
            ValueError: If audio_bytes cannot be parsed as a known audio format.
        """
        ...
