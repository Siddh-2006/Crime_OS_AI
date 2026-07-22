"""
Audio Worker — metadata extractor implementations (M6).

AudioMetadataExtractor:
  - Uses mutagen to read audio headers (codec, duration, sample rate, bit rate).
  - Falls back to pydub for formats mutagen doesn't handle (e.g. raw WAV details).
  - Never uses AI. Purely deterministic.
  - Derives MIME type from file extension + mutagen codec info.

MockAudioMetadataExtractor:
  - Returns a configurable AudioMetadata for unit tests.
  - No I/O, no external dependencies.
"""
from __future__ import annotations

import io
import mimetypes

from app.audio_worker.interfaces import IAudioMetadataExtractor
from app.core.logging import logger
from app.schemas.evidence import AudioMetadata


# MIME type map for common audio formats
_EXT_TO_MIME: dict[str, str] = {
    ".mp3":  "audio/mpeg",
    ".wav":  "audio/wav",
    ".ogg":  "audio/ogg",
    ".oga":  "audio/ogg",
    ".flac": "audio/flac",
    ".m4a":  "audio/mp4",
    ".mp4":  "audio/mp4",
    ".webm": "audio/webm",
    ".aac":  "audio/aac",
    ".opus": "audio/ogg",
}

_CODEC_MAP: dict[str, str] = {
    "MP3":  "mp3",
    "FLAC": "flac",
    "OGG":  "ogg",
    "OPUS": "opus",
    "AAC":  "aac",
    "ALAC": "alac",
    "WAVE": "wav",
    "ASF":  "wma",
    "MP4":  "aac",
    "AIFF": "aiff",
}


def _mime_from_filename(file_name: str) -> str:
    """Best-effort MIME type from file extension."""
    ext = "." + file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
    if ext in _EXT_TO_MIME:
        return _EXT_TO_MIME[ext]
    guessed, _ = mimetypes.guess_type(file_name)
    return guessed or "audio/octet-stream"


class AudioMetadataExtractor(IAudioMetadataExtractor):
    """
    Extracts audio metadata using mutagen (header parsing) with pydub fallback.

    Supported formats: MP3, WAV, FLAC, OGG, OPUS, M4A, AAC, WEBM.
    Does not require ffmpeg to be on PATH — mutagen reads headers directly.
    """

    def extract(
        self,
        audio_bytes: bytes,
        file_name: str,
        file_size_bytes: int,
    ) -> AudioMetadata:
        mime_type = _mime_from_filename(file_name)

        try:
            return self._extract_with_mutagen(audio_bytes, file_name, file_size_bytes, mime_type)
        except Exception as mutagen_exc:
            logger.warning(
                "mutagen extraction failed, attempting pydub fallback",
                extra={"file_name": file_name, "error": str(mutagen_exc)},
            )
            return self._extract_with_pydub(audio_bytes, file_name, file_size_bytes, mime_type)

    def _extract_with_mutagen(
        self,
        audio_bytes: bytes,
        file_name: str,
        file_size_bytes: int,
        mime_type: str,
    ) -> AudioMetadata:
        import mutagen  # type: ignore[import-untyped]

        buf = io.BytesIO(audio_bytes)
        tag = mutagen.File(buf, easy=False)
        if tag is None:
            raise ValueError("mutagen could not identify audio format")

        info = tag.info
        duration_seconds = float(getattr(info, "length", 0.0))
        sample_rate = int(getattr(info, "sample_rate", 0)) or None
        channels = int(getattr(info, "channels", 0)) or None
        bit_rate = int(getattr(info, "bitrate", 0)) or None  # kbps from mutagen
        if bit_rate:
            bit_rate = bit_rate * 1000  # convert kbps → bps

        # Derive codec from mutagen class name (e.g. "MP3" from "mutagen.mp3.MP3")
        codec_class = type(tag).__name__.upper()
        codec = _CODEC_MAP.get(codec_class, codec_class.lower() or None)

        logger.debug(
            "Audio metadata extracted (mutagen)",
            extra={
                "file_name": file_name,
                "duration_seconds": duration_seconds,
                "codec": codec,
                "sample_rate": sample_rate,
            },
        )
        return AudioMetadata(
            duration_seconds=duration_seconds,
            sample_rate=sample_rate,
            channels=channels,
            codec=codec,
            file_size_bytes=file_size_bytes,
            mime_type=mime_type,
            bit_rate=bit_rate,
        )

    def _extract_with_pydub(
        self,
        audio_bytes: bytes,
        file_name: str,
        file_size_bytes: int,
        mime_type: str,
    ) -> AudioMetadata:
        from pydub import AudioSegment  # type: ignore[import-untyped]

        ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else "wav"
        audio = AudioSegment.from_file(io.BytesIO(audio_bytes), format=ext)
        duration_seconds = len(audio) / 1000.0
        sample_rate = audio.frame_rate or None
        channels = audio.channels or None

        logger.debug(
            "Audio metadata extracted (pydub fallback)",
            extra={
                "file_name": file_name,
                "duration_seconds": duration_seconds,
                "sample_rate": sample_rate,
            },
        )
        return AudioMetadata(
            duration_seconds=duration_seconds,
            sample_rate=sample_rate,
            channels=channels,
            codec=ext,
            file_size_bytes=file_size_bytes,
            mime_type=mime_type,
            bit_rate=None,
        )


# ── Mock implementation ────────────────────────────────────────────────────────

class MockAudioMetadataExtractor(IAudioMetadataExtractor):
    """
    Deterministic metadata extractor for unit tests.
    Returns a fixed AudioMetadata regardless of input.
    """

    def __init__(self, result: AudioMetadata | None = None) -> None:
        self._result = result or AudioMetadata(
            duration_seconds=3.5,
            sample_rate=16000,
            channels=1,
            codec="wav",
            file_size_bytes=56000,
            mime_type="audio/wav",
            bit_rate=128000,
        )

    def extract(
        self,
        audio_bytes: bytes,
        file_name: str,
        file_size_bytes: int,
    ) -> AudioMetadata:
        return self._result
