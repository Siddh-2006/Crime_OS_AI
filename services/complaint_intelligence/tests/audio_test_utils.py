"""
Shared test utilities for audio worker tests (M6).

Generates minimal valid audio files in-memory using Python's struct module.
No external dependencies (no ffmpeg, no pydub) required in the test suite.
"""
from __future__ import annotations

import struct
import wave
import io


# ── WAV generation (pure stdlib) ──────────────────────────────────────────────

def make_wav_bytes(
    duration_ms: int = 500,
    sample_rate: int = 16000,
    channels: int = 1,
    amplitude: int = 1000,
) -> bytes:
    """
    Generate a minimal valid WAV file containing a 440 Hz sine wave.

    Args:
        duration_ms:  Duration in milliseconds.
        sample_rate:  Sample rate in Hz (default 16 kHz).
        channels:     Number of channels (default 1 = mono).
        amplitude:    Peak amplitude (default 1000 — audible but not clipping).

    Returns:
        Raw WAV file bytes, readable by Python's wave module and mutagen.
    """
    import math

    num_samples = int(sample_rate * duration_ms / 1000)
    buf = io.BytesIO()

    with wave.open(buf, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)           # 16-bit PCM
        wf.setframerate(sample_rate)

        # Generate 440 Hz sine wave
        frames = bytearray()
        for i in range(num_samples):
            sample = int(amplitude * math.sin(2 * math.pi * 440 * i / sample_rate))
            # Pack as little-endian signed 16-bit, repeated for each channel
            frames += struct.pack("<h", sample) * channels

        wf.writeframes(bytes(frames))

    return buf.getvalue()


def make_silent_wav_bytes(
    duration_ms: int = 500,
    sample_rate: int = 16000,
) -> bytes:
    """
    Generate a valid WAV file containing only silence (all zeros).
    Useful for testing the 'no_speech' path.
    """
    num_samples = int(sample_rate * duration_ms / 1000)
    buf = io.BytesIO()

    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(b"\x00\x00" * num_samples)

    return buf.getvalue()


# ── Edge-case fixtures ────────────────────────────────────────────────────────

#: Zero-length bytes — triggers the empty-payload validation error.
EMPTY_AUDIO_BYTES: bytes = b""

#: Random garbage bytes that are not a valid audio file.
NOT_AUDIO_BYTES: bytes = b"\xff\xfe\x00\x01invalid audio data here\xde\xad\xbe\xef"
