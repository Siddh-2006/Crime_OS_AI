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


# ── Gemini production transcriber ─────────────────────────────────────────────

class GeminiTranscriber(IAudioTranscriber):
    """
    Production transcriber backed by Gemini multimodal API.
    Used when APP_ENV=production — no faster-whisper / CTranslate2 needed.
    Uses raw httpx (already in requirements) — no extra dependency.

    Gemini receives the audio file as inline base64 data and returns a
    plain-text transcription. We map this to the same AudioTranscript
    interface as WhisperTranscriber.

    Supported audio MIME types by Gemini:
        audio/wav, audio/mp3, audio/mpeg, audio/ogg, audio/flac,
        audio/aac, audio/webm, audio/x-m4a
    """

    def __init__(self) -> None:
        import os
        self._api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        self._model   = os.environ.get("GEMINI_STT_MODEL", "gemini-2.5-flash-lite").strip()
        if not self._api_key:
            logger.warning("[gemini_stt] GEMINI_API_KEY not set — transcription will return empty results")

    def _detect_mime(self, audio_bytes: bytes) -> str:
        """Best-effort MIME detection from magic bytes."""
        if audio_bytes[:4] == b"RIFF":
            return "audio/wav"
        if audio_bytes[:3] == b"ID3" or audio_bytes[:2] == b"\xff\xfb":
            return "audio/mp3"
        if audio_bytes[:4] == b"fLaC":
            return "audio/flac"
        if audio_bytes[:4] == b"OggS":
            return "audio/ogg"
        # Default — Gemini handles most audio as audio/mpeg
        return "audio/mpeg"

    async def transcribe(self, audio_bytes: bytes) -> AudioTranscript:
        import base64
        import httpx

        if not audio_bytes:
            raise ValueError("Audio bytes are empty — nothing to transcribe.")

        if not self._api_key:
            return AudioTranscript(
                detected_language="en",
                language_probability=0.0,
                raw_text="",
                translated_text=None,
                segments=[],
            )

        mime = self._detect_mime(audio_bytes)
        b64  = base64.b64encode(audio_bytes).decode()
        url  = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self._model}:generateContent?key={self._api_key}"
        )
        payload = {
            "contents": [{
                "role": "user",
                "parts": [
                    {"text": (
                        "Transcribe all speech in this audio file exactly as spoken. "
                        "If the speech is in a language other than English, first provide the original "
                        "transcription then provide an English translation on a new line prefixed with "
                        "'TRANSLATION: '. "
                        "Output only the transcription (and translation if needed), nothing else."
                    )},
                    {"inline_data": {"mime_type": mime, "data": b64}},
                ],
            }],
            "generationConfig": {"temperature": 0.0, "maxOutputTokens": 2048},
        }

        logger.info("[gemini_stt] Starting transcription")
        raw_text = ""
        translated_text: str | None = None

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                data = resp.json()
                content = (
                    data.get("candidates", [{}])[0]
                        .get("content", {})
                        .get("parts", [{}])[0]
                        .get("text", "")
                        .strip()
                )
            # Split out translation if present
            if "TRANSLATION:" in content:
                parts = content.split("TRANSLATION:", 1)
                raw_text = parts[0].strip()
                translated_text = parts[1].strip() or None
            else:
                raw_text = content
        except Exception as exc:
            logger.warning("[gemini_stt] API call failed", extra={"error": str(exc)})

        logger.info(
            "[gemini_stt] Transcription completed",
            extra={"chars": len(raw_text), "has_translation": translated_text is not None},
        )

        # Build a single segment spanning the whole audio (no timestamps from Gemini)
        segments = (
            [TranscriptSegment(start=0.0, end=0.0, text=raw_text, confidence=0.95)]
            if raw_text else []
        )

        return AudioTranscript(
            detected_language="unknown",   # Gemini doesn't expose detected language
            language_probability=1.0,
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
