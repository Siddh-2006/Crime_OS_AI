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
from app.text_intelligence.entity_linker import PassthroughEntityLinker
from app.text_intelligence.event_extractor import TemporalEventExtractor
from app.text_intelligence.ner_extractor import MockNERExtractor
from app.text_intelligence.regex_extractor import IndianRegexExtractor
from app.image_worker.captioner import MockImageCaptioner
from app.image_worker.evidence_builder import EvidenceBuilder
from app.image_worker.metadata_extractor import PILMetadataExtractor
from app.image_worker.preprocessor import PILImagePreprocessor
from app.image_worker.text_detector import MockTextDetector


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
    # Override text intelligence extractors — no spaCy required in tests
    container.ner_extractor = MockNERExtractor()
    container.regex_extractor = IndianRegexExtractor()
    container.event_extractor = TemporalEventExtractor()
    container.entity_linker = PassthroughEntityLinker()
    # Override image worker — no Florence required in unit tests
    container.metadata_extractor = PILMetadataExtractor()
    container.image_preprocessor = PILImagePreprocessor()
    container.text_detector = MockTextDetector(returns=False)
    container.image_captioner = MockImageCaptioner()
    container.evidence_builder = EvidenceBuilder()
    application.dependency_overrides[get_di_container] = lambda: container

    return application


@pytest.fixture
def client(app) -> TestClient:
    """Synchronous TestClient (wraps async app via anyio)."""
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
