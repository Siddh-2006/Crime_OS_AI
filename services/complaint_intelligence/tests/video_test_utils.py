"""
Shared test utilities for video worker tests (M7).

Provides:
  - make_test_video_bytes() — minimal MP4 header bytes (enough to pass HTTP validation)
  - make_mock_image_worker() — fully mocked ImageWorker (no Florence-2, no PIL)
  - make_mock_audio_worker() — fully mocked AudioWorker (no Whisper)
  - EMPTY_VIDEO_BYTES — zero-length bytes for empty-file tests
  - NOT_VIDEO_BYTES — garbage bytes for corruption tests
"""
from __future__ import annotations

from app.audio_worker.metadata_extractor import MockAudioMetadataExtractor
from app.audio_worker.transcriber import MockAudioTranscriber
from app.audio_worker.worker import AudioWorker
from app.image_worker.captioner import MockImageCaptioner
from app.image_worker.evidence_builder import EvidenceBuilder
from app.image_worker.metadata_extractor import PILMetadataExtractor
from app.image_worker.preprocessor import PILImagePreprocessor
from app.image_worker.text_detector import MockTextDetector
from app.image_worker.worker import ImageWorker
from app.queue.mock_queue import MockQueue


# ── Fake video bytes ──────────────────────────────────────────────────────────

# Minimal MP4 ftyp box header — valid enough to pass MIME/size checks
# (VideoWorker mocks bypass OpenCV so we never actually need a parseable video in tests)
_MP4_FTYP_HEADER = (
    b"\x00\x00\x00\x18"  # box size: 24 bytes
    b"ftyp"              # box type: ftyp
    b"isom"              # major brand
    b"\x00\x00\x00\x01" # minor version
    b"isom"              # compatible brand
)

FAKE_MP4_BYTES: bytes = _MP4_FTYP_HEADER + b"\x00" * 256
EMPTY_VIDEO_BYTES: bytes = b""
NOT_VIDEO_BYTES: bytes = b"not a video file\xde\xad\xbe\xef"


# ── Mock worker factories ─────────────────────────────────────────────────────

def make_mock_image_worker(queue: MockQueue | None = None) -> ImageWorker:
    """
    Returns a fully mocked ImageWorker with:
      - MockTextDetector (returns=False — no text, goes to captioner path)
      - MockImageCaptioner (returns a fixed ImageAnalysisResult)
      - PILMetadataExtractor (reads real image headers — works on JPEG bytes)
      - PILImagePreprocessor (resize only — no network calls)
      - EvidenceBuilder (pure business logic)
    """
    return ImageWorker(
        metadata_extractor=PILMetadataExtractor(),
        preprocessor=PILImagePreprocessor(),
        text_detector=MockTextDetector(returns=False),
        captioner=MockImageCaptioner(),
        evidence_builder=EvidenceBuilder(),
        queue=queue or MockQueue(),
    )


def make_mock_audio_worker(queue: MockQueue | None = None) -> AudioWorker:
    """
    Returns a fully mocked AudioWorker with:
      - MockAudioTranscriber (returns a fixed English AudioTranscript)
      - MockAudioMetadataExtractor (returns a fixed AudioMetadata)
    """
    return AudioWorker(
        transcriber=MockAudioTranscriber(),
        metadata_extractor=MockAudioMetadataExtractor(),
        queue=queue or MockQueue(),
    )
