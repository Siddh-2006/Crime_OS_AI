"""
Video Worker — audio extractor implementations (M7).

MoviePyAudioExtractor:
  - Uses moviepy to extract the audio track from a video file.
  - Converts audio to 16 kHz mono PCM WAV (ready for Whisper).
  - Returns None gracefully if the video has no audio track.
  - Requires ffmpeg to be on PATH.

MockAudioExtractor:
  - Returns a configurable WAV bytes object or None for unit tests.
  - No file I/O, no ffmpeg dependency in tests.
"""
from __future__ import annotations

import io
import os
import struct
import tempfile
import wave

from app.core.logging import logger
from app.video_worker.interfaces import IAudioExtractor


def _make_minimal_wav(duration_ms: int = 100, sample_rate: int = 16000) -> bytes:
    """Generate a minimal silent WAV for use in MockAudioExtractor."""
    num_samples = int(sample_rate * duration_ms / 1000)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(b"\x00\x00" * num_samples)
    return buf.getvalue()


class MoviePyAudioExtractor(IAudioExtractor):
    """
    Extracts the audio track from a video file using moviepy.

    Output: 16 kHz mono PCM WAV bytes, ready for WhisperTranscriber.
    Returns None if the video has no audio track.
    """

    def extract(self, video_path: str) -> bytes | None:
        try:
            from moviepy.editor import VideoFileClip  # type: ignore[import-untyped]
        except ImportError as exc:
            raise RuntimeError(
                "moviepy is required for audio extraction. "
                "Install it with: pip install moviepy"
            ) from exc

        logger.info("Audio extraction started", extra={"video_path": video_path})

        try:
            clip = VideoFileClip(video_path)
        except Exception as exc:
            raise RuntimeError(f"moviepy could not open video '{video_path}': {exc}") from exc

        try:
            if clip.audio is None:
                logger.info("No audio track found", extra={"video_path": video_path})
                return None

            tmp_audio: str | None = None
            try:
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                    tmp_audio = tmp.name

                clip.audio.write_audiofile(
                    tmp_audio,
                    fps=16000,
                    nbytes=2,
                    codec="pcm_s16le",
                    buffersize=200000,
                    verbose=False,
                    logger=None,
                )
                with open(tmp_audio, "rb") as f:
                    audio_bytes = f.read()
            finally:
                if tmp_audio and os.path.exists(tmp_audio):
                    os.unlink(tmp_audio)

        finally:
            clip.close()

        logger.info(
            "Audio extraction completed",
            extra={"video_path": video_path, "audio_bytes": len(audio_bytes)},
        )
        return audio_bytes


class MockAudioExtractor(IAudioExtractor):
    """
    Deterministic audio extractor for unit tests.
    Returns a small WAV bytes or None — no file I/O, no ffmpeg dependency.
    """

    def __init__(self, audio_bytes: bytes | None = _make_minimal_wav()) -> None:
        self._audio_bytes = audio_bytes

    def extract(self, video_path: str) -> bytes | None:
        return self._audio_bytes
