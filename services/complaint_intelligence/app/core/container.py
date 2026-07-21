"""
Dependency Injection container.
All shared singletons are created here and injected via FastAPI Depends().
This ensures business logic never instantiates infrastructure directly.
"""
from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING

from app.core.config import Settings, settings
from app.core.logging import logger

if TYPE_CHECKING:
    from app.llm.client import ILLMClient
    from app.text_intelligence.interfaces import (
        IEntityLinker,
        IEventExtractor,
        INERExtractor,
        IRegexExtractor,
    )
    from app.image_worker.interfaces import (
        IEvidenceBuilder,
        IImageCaptioner,
        IImagePreprocessor,
        IMetadataExtractor,
        ITextDetector,
    )
    from app.ocr_worker.interfaces import IOCREngine, ITranslationEngine
    from app.ocr_worker.worker import OCRWorker


class Container:
    """
    Lightweight DI container.
    Singletons are lazily initialised on first access and reused thereafter.
    Replace any dependency here without touching business logic.
    """

    def __init__(self, cfg: Settings) -> None:
        self._cfg = cfg
        self._ollama_client: ILLMClient | None = None
        self._ner_extractor: INERExtractor | None = None
        self._regex_extractor: IRegexExtractor | None = None
        self._event_extractor: IEventExtractor | None = None
        self._entity_linker: IEntityLinker | None = None
        # Image worker
        self._metadata_extractor: IMetadataExtractor | None = None
        self._image_preprocessor: IImagePreprocessor | None = None
        self._text_detector: ITextDetector | None = None
        self._image_captioner: IImageCaptioner | None = None
        self._evidence_builder: IEvidenceBuilder | None = None
        # OCR worker
        self._ocr_engine: IOCREngine | None = None
        self._translation_engine: ITranslationEngine | None = None
        self._ocr_worker: OCRWorker | None = None

    @property
    def config(self) -> Settings:
        return self._cfg

    @property
    def llm_client(self) -> ILLMClient:
        if self._ollama_client is None:
            from app.llm.client import OllamaLLMClient
            self._ollama_client = OllamaLLMClient(
                base_url=self._cfg.OLLAMA_BASE_URL,
                model=self._cfg.OLLAMA_MODEL,
                timeout=self._cfg.OLLAMA_TIMEOUT_SECONDS,
                num_ctx=self._cfg.OLLAMA_NUM_CTX,
            )
        return self._ollama_client

    @llm_client.setter
    def llm_client(self, client: ILLMClient) -> None:
        self._ollama_client = client

    @property
    def ner_extractor(self) -> INERExtractor:
        if self._ner_extractor is None:
            from app.text_intelligence.ner_extractor import SpacyNERExtractor
            self._ner_extractor = SpacyNERExtractor()
        return self._ner_extractor

    @ner_extractor.setter
    def ner_extractor(self, extractor: INERExtractor) -> None:
        self._ner_extractor = extractor

    @property
    def regex_extractor(self) -> IRegexExtractor:
        if self._regex_extractor is None:
            from app.text_intelligence.regex_extractor import IndianRegexExtractor
            self._regex_extractor = IndianRegexExtractor()
        return self._regex_extractor

    @regex_extractor.setter
    def regex_extractor(self, extractor: IRegexExtractor) -> None:
        self._regex_extractor = extractor

    @property
    def event_extractor(self) -> IEventExtractor:
        if self._event_extractor is None:
            from app.text_intelligence.event_extractor import TemporalEventExtractor
            self._event_extractor = TemporalEventExtractor()
        return self._event_extractor

    @event_extractor.setter
    def event_extractor(self, extractor: IEventExtractor) -> None:
        self._event_extractor = extractor

    @property
    def entity_linker(self) -> IEntityLinker:
        if self._entity_linker is None:
            from app.text_intelligence.entity_linker import PassthroughEntityLinker
            self._entity_linker = PassthroughEntityLinker()
        return self._entity_linker

    @entity_linker.setter
    def entity_linker(self, linker: IEntityLinker) -> None:
        self._entity_linker = linker

    # ── Image Worker ──────────────────────────────────────────────────────────

    @property
    def metadata_extractor(self) -> IMetadataExtractor:
        if self._metadata_extractor is None:
            from app.image_worker.metadata_extractor import PILMetadataExtractor
            self._metadata_extractor = PILMetadataExtractor()
        return self._metadata_extractor

    @metadata_extractor.setter
    def metadata_extractor(self, extractor: IMetadataExtractor) -> None:
        self._metadata_extractor = extractor

    @property
    def image_preprocessor(self) -> IImagePreprocessor:
        if self._image_preprocessor is None:
            from app.image_worker.preprocessor import PILImagePreprocessor
            self._image_preprocessor = PILImagePreprocessor()
        return self._image_preprocessor

    @image_preprocessor.setter
    def image_preprocessor(self, preprocessor: IImagePreprocessor) -> None:
        self._image_preprocessor = preprocessor

    @property
    def text_detector(self) -> ITextDetector:
        if self._text_detector is None:
            from app.image_worker.text_detector import FlorenceTextDetector
            self._text_detector = FlorenceTextDetector()
        return self._text_detector

    @text_detector.setter
    def text_detector(self, detector: ITextDetector) -> None:
        self._text_detector = detector

    @property
    def image_captioner(self) -> IImageCaptioner:
        if self._image_captioner is None:
            from app.image_worker.captioner import FlorenceCaptioner
            self._image_captioner = FlorenceCaptioner()
        return self._image_captioner

    @image_captioner.setter
    def image_captioner(self, captioner: IImageCaptioner) -> None:
        self._image_captioner = captioner

    @property
    def evidence_builder(self) -> IEvidenceBuilder:
        if self._evidence_builder is None:
            from app.image_worker.evidence_builder import EvidenceBuilder
            self._evidence_builder = EvidenceBuilder()
        return self._evidence_builder

    @evidence_builder.setter
    def evidence_builder(self, builder: IEvidenceBuilder) -> None:
        self._evidence_builder = builder

    # ── OCR Worker ─────────────────────────────────────────────────────────

    @property
    def ocr_engine(self) -> IOCREngine:
        if self._ocr_engine is None:
            from app.ocr_worker.engine import PaddleOCREngine
            self._ocr_engine = PaddleOCREngine()
        return self._ocr_engine

    @ocr_engine.setter
    def ocr_engine(self, engine: IOCREngine) -> None:
        self._ocr_engine = engine

    @property
    def translation_engine(self) -> ITranslationEngine:
        if self._translation_engine is None:
            from app.ocr_worker.translator import DeepTranslator
            self._translation_engine = DeepTranslator()
        return self._translation_engine

    @translation_engine.setter
    def translation_engine(self, engine: ITranslationEngine) -> None:
        self._translation_engine = engine

    @property
    def ocr_worker(self) -> OCRWorker:
        if self._ocr_worker is None:
            from app.ocr_worker.worker import OCRWorker
            from app.queue.mock_queue import MockQueue
            self._ocr_worker = OCRWorker(
                ocr_engine=self.ocr_engine,
                translator=self.translation_engine,
                queue=MockQueue(),
            )
        return self._ocr_worker

    @ocr_worker.setter
    def ocr_worker(self, worker: OCRWorker) -> None:
        self._ocr_worker = worker


@lru_cache(maxsize=1)
def get_container() -> Container:
    """FastAPI dependency — returns the application-wide DI container."""
    logger.debug("Initialising DI container")
    return Container(cfg=settings)
