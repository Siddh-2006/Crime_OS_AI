"""
Audio Worker — transcriber implementations (M6).

WhisperTranscriber:
  - Uses faster-whisper (CTranslate2 backend) for CPU-friendly inference.
  - Model: configurable via settings.WHISPER_MODEL (default: "tiny").
  - Lazy-loaded once with @lru_cache — shared across all requests.
  - Detects language, transcribes, and translates to English if non-English.
  - Never returns raw faster-whisper output — always returns AudioTranscript.

MockAudioTranscriber:
  - Deterministic in-memory implementation for unit tests.
  - No model loading, no I/O.
  - Supports configurable responses via set_response().
"""
from __future__ import annotations

import math
from functools import lru_cache
from typing import Any

from app.audio_worker.interfaces import IAudioTranscriber
from app.core.logging import logger
from app.schemas.evidence import AudioTranscript, TranscriptSegment


# ── Real implementation ────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _load_whisper_model() -> Any:
    """
    Lazy-load faster-whisper WhisperModel once per process.
    Cached across all requests to avoid repeated cold starts.
    """
    from faster_whisper import WhisperModel  # type: ignore[import-untyped]
    from app.core.config import settings

    logger.info(
        "Loading Whisper model (first use — may take a moment)",
        extra={
            "model": settings.WHISPER_MODEL,
            "device": settings.WHISPER_DEVICE,
            "compute_type": settings.WHISPER_COMPUTE_TYPE,
        },
    )
    model = WhisperModel(
        settings.WHISPER_MODEL,
        device=settings.WHISPER_DEVICE,
        compute_type=settings.WHISPER_COMPUTE_TYPE,
    )
    logger.info(
        "Whisper model loaded",
        extra={"model": settings.WHISPER_MODEL, "device": settings.WHISPER_DEVICE},
    )
    return model


def _avg_log_prob_to_confidence(avg_log_prob: float) -> float:
    """
    Convert Whisper's avg_logprob (negative float, e.g. -0.3) to a 0–1 confidence.
    Clamps to [0.0, 1.0].
    """
    # e^avg_log_prob gives the geometric mean token probability.
    confidence = math.exp(avg_log_prob)
    return max(0.0, min(1.0, confidence))


class WhisperTranscriber(IAudioTranscriber):
    """
    Production transcriber backed by faster-whisper.

    Transcription strategy:
      1. Detect language from the first 30 seconds.
      2. Transcribe in the source language.
      3. If source is non-English → re-run with task="translate" for English text.
      4. Return a typed AudioTranscript — never raw faster-whisper output.
    """

    async def transcribe(self, audio_bytes: bytes) -> AudioTranscript:
        if not audio_bytes:
            raise ValueError("Audio bytes are empty — nothing to transcribe.")

        import io
        import tempfile
        import os

        # faster-whisper requires a file path or numpy array.
        # We write to a temp file, transcribe, then clean up.
        with tempfile.NamedTemporaryFile(suffix=".audio", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            return await self._transcribe_file(tmp_path)
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    async def _transcribe_file(self, file_path: str) -> AudioTranscript:
        """Internal: transcribe a file path, return AudioTranscript."""
        model = _load_whisper_model()

        logger.info("Whisper transcription started", extra={"file": file_path})

        # Step 1: Transcribe (auto-detect language)
        segments_iter, info = model.transcribe(
            file_path,
            task="transcribe",
            beam_size=1,         # fast for CPU
            vad_filter=True,     # skip silent segments
            vad_parameters={"min_silence_duration_ms": 500},
        )

        detected_language = info.language
        language_probability = float(info.language_probability)

        segments: list[TranscriptSegment] = []
        raw_parts: list[str] = []

        for seg in segments_iter:
            confidence = _avg_log_prob_to_confidence(seg.avg_logprob)
            segments.append(
                TranscriptSegment(
                    start=seg.start,
                    end=seg.end,
                    text=seg.text.strip(),
                    confidence=confidence,
                )
            )
            raw_parts.append(seg.text.strip())

        raw_text = " ".join(raw_parts).strip()
        logger.info(
            "Whisper transcription completed",
            extra={
                "language": detected_language,
                "language_probability": language_probability,
                "segments": len(segments),
                "chars": len(raw_text),
            },
        )

        # Step 2: Translate to English if non-English and there is content
        translated_text: str | None = None
        if detected_language != "en" and raw_text:
            logger.info(
                "Whisper translation started",
                extra={"source_language": detected_language},
            )
            trans_iter, _ = model.transcribe(
                file_path,
                task="translate",
                beam_size=1,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 500},
            )
            trans_parts = [seg.text.strip() for seg in trans_iter]
            translated_text = " ".join(trans_parts).strip() or None
            logger.info("Whisper translation completed")

        return AudioTranscript(
            detected_language=detected_language,
            language_probability=language_probability,
            raw_text=raw_text,
            translated_text=translated_text,
            segments=segments,
        )


# ── Mock implementation ────────────────────────────────────────────────────────

class MockAudioTranscriber(IAudioTranscriber):
    """
    Deterministic in-memory transcriber for unit tests.
    No model loading. No I/O. Configurable responses via set_response().
    """

    def __init__(
        self,
        default_transcript: AudioTranscript | None = None,
    ) -> None:
        self._default = default_transcript or AudioTranscript(
            detected_language="en",
            language_probability=0.99,
            raw_text="Mock transcription result.",
            translated_text=None,
            segments=[
                TranscriptSegment(start=0.0, end=1.5, text="Mock transcription result.", confidence=0.95),
            ],
        )
        self._responses: dict[str, AudioTranscript] = {}

    def set_response(self, key: str, transcript: AudioTranscript) -> None:
        """Register a named response. Key can be any identifier."""
        self._responses[key] = transcript

    async def transcribe(self, audio_bytes: bytes) -> AudioTranscript:
        if not audio_bytes:
            raise ValueError("Audio bytes are empty — nothing to transcribe.")
        # Return key-matched response if registered, else default
        return self._responses.get("default", self._default)
