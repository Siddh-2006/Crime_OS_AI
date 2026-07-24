"""
Shared pytest fixtures for the complaint_intelligence test suite.
All fixtures use MockQueue — no Redis dependency required for unit tests.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_di_container, get_queue
from app.core.container import get_container
from app.llm.client import MockLLMClient
from app.main import create_app
from app.queue.mock_queue import MockQueue
from app.image_worker.captioner import MockImageCaptioner
from app.image_worker.evidence_builder import EvidenceBuilder
from app.image_worker.metadata_extractor import PILMetadataExtractor
from app.image_worker.preprocessor import PILImagePreprocessor
from app.image_worker.text_detector import MockTextDetector
from app.ocr_worker.translator import NoOpTranslator
from tests.pdf_test_utils import MockOCREngine
from app.audio_worker.transcriber import MockAudioTranscriber
from app.audio_worker.metadata_extractor import MockAudioMetadataExtractor
from app.video_worker.scene_detector import MockSceneDetector
from app.video_worker.keyframe_extractor import MockKeyframeExtractor
from app.video_worker.audio_extractor import MockAudioExtractor
from app.video_worker.metadata_extractor import MockVideoMetadataExtractor
from app.pdf_worker.text_extractor import MockPDFTextExtractor
from app.pdf_worker.page_renderer import MockPDFPageRenderer
from app.pdf_worker.metadata_extractor import MockPDFMetadataExtractor


@pytest.fixture
def mock_queue() -> MockQueue:
    """Fresh MockQueue per test — no cross-test contamination."""
    return MockQueue()


@pytest.fixture
def mock_llm_client() -> MockLLMClient:
    """Fresh MockLLMClient per test."""
    return MockLLMClient()


@pytest.fixture
def app(mock_queue: MockQueue, mock_llm_client: MockLLMClient):
    """
    FastAPI app with dependency overrides:
      - get_queue          → MockQueue (no Redis)
      - get_di_container   → container with mock_llm_client + mock extractors
    """
    application = create_app()
    application.dependency_overrides[get_queue] = lambda: mock_queue

    container = get_container()
    container.llm_client = mock_llm_client
    # Override image worker — no Florence required in unit tests
    container.metadata_extractor = PILMetadataExtractor()
    container.image_preprocessor = PILImagePreprocessor()
    container.text_detector = MockTextDetector(returns=False)
    container.image_captioner = MockImageCaptioner()
    container.evidence_builder = EvidenceBuilder()
    # Override OCR worker — no PaddleOCR or deep_translator in tests
    container.ocr_engine = MockOCREngine()
    container.translation_engine = NoOpTranslator()
    from app.ocr_worker.worker import OCRWorker
    container.ocr_worker = OCRWorker(
        ocr_engine=container.ocr_engine,
        translator=container.translation_engine,
        queue=mock_queue,
    )
    # Override audio worker — no Whisper or mutagen required in unit tests
    container.audio_transcriber = MockAudioTranscriber()
    container.audio_metadata_extractor = MockAudioMetadataExtractor()
    # Re-create audio_worker so it picks up the mock dependencies
    from app.audio_worker.worker import AudioWorker
    container.audio_worker = AudioWorker(
        transcriber=container.audio_transcriber,
        metadata_extractor=container.audio_metadata_extractor,
        queue=mock_queue,
    )
    # Override video worker — no OpenCV, PySceneDetect, or moviepy in tests
    from tests.audio_test_utils import make_silent_wav_bytes
    container.scene_detector = MockSceneDetector()
    container.keyframe_extractor = MockKeyframeExtractor()
    container.video_audio_extractor = MockAudioExtractor(audio_bytes=make_silent_wav_bytes())
    container.video_metadata_extractor = MockVideoMetadataExtractor()
    # Re-create video_worker with all mocked sub-workers
    from app.video_worker.worker import VideoWorker
    container.video_worker = VideoWorker(
        scene_detector=container.scene_detector,
        keyframe_extractor=container.keyframe_extractor,
        audio_extractor=container.video_audio_extractor,
        video_metadata_extractor=container.video_metadata_extractor,
        image_worker=container.image_worker,
        audio_worker=container.audio_worker,
        frames_per_scene=3,
    )
    # Override pdf worker — no pymupdf in tests
    container.pdf_text_extractor = MockPDFTextExtractor(pages_text=["Sample digital PDF text page."])
    container.pdf_page_renderer = MockPDFPageRenderer()
    container.pdf_metadata_extractor = MockPDFMetadataExtractor()
    from app.pdf_worker.worker import PDFWorker
    container.pdf_worker = PDFWorker(
        text_extractor=container.pdf_text_extractor,
        page_renderer=container.pdf_page_renderer,
        metadata_extractor=container.pdf_metadata_extractor,
        ocr_worker=container.ocr_worker,
        translator=container.translation_engine,
        queue=mock_queue,
        digital_char_threshold=20,
    )
    application.dependency_overrides[get_di_container] = lambda: container

    return application


@pytest.fixture
def client(app) -> TestClient:
    """Synchronous TestClient (wraps async app via anyio)."""
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
