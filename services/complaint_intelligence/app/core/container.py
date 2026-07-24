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
    from app.image_worker.interfaces import (
        IEvidenceBuilder,
        IImageCaptioner,
        IImagePreprocessor,
        IMetadataExtractor,
        ITextDetector,
    )
    from app.ocr_worker.interfaces import IOCREngine, ITranslationEngine
    from app.ocr_worker.worker import OCRWorker
    from app.audio_worker.interfaces import IAudioTranscriber, IAudioMetadataExtractor
    from app.audio_worker.worker import AudioWorker
    from app.video_worker.interfaces import (
        ISceneDetector,
        IKeyframeExtractor,
        IAudioExtractor,
        IVideoMetadataExtractor,
    )
    from app.video_worker.worker import VideoWorker
    from app.pdf_worker.interfaces import (
        IPDFTextExtractor,
        IPDFPageRenderer,
        IPDFMetadataExtractor,
    )
    from app.pdf_worker.worker import PDFWorker


class Container:
    """
    Lightweight DI container.
    Singletons are lazily initialised on first access and reused thereafter.
    Replace any dependency here without touching business logic.
    """

    def __init__(self, cfg: Settings) -> None:
        self._cfg = cfg
        self._ollama_client: ILLMClient | None = None
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
        # Audio worker
        self._audio_transcriber: IAudioTranscriber | None = None
        self._audio_metadata_extractor: IAudioMetadataExtractor | None = None
        self._audio_worker: AudioWorker | None = None
        # Video worker
        self._scene_detector: ISceneDetector | None = None
        self._keyframe_extractor: IKeyframeExtractor | None = None
        self._audio_extractor: IAudioExtractor | None = None
        self._video_metadata_extractor: IVideoMetadataExtractor | None = None
        self._video_worker: VideoWorker | None = None
        # PDF worker
        self._pdf_text_extractor: IPDFTextExtractor | None = None
        self._pdf_page_renderer: IPDFPageRenderer | None = None
        self._pdf_metadata_extractor: IPDFMetadataExtractor | None = None
        self._pdf_worker: PDFWorker | None = None
        # Case Understanding Single Engine
        self._case_context_builder = None
        self._case_understanding_engine = None
        self._case_repository = None

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

    @property
    def image_worker(self):
        """Fully wired ImageWorker — reused by VideoWorker (M7)."""
        from app.image_worker.worker import ImageWorker
        from app.queue.mock_queue import MockQueue
        return ImageWorker(
            metadata_extractor=self.metadata_extractor,
            preprocessor=self.image_preprocessor,
            text_detector=self.text_detector,
            captioner=self.image_captioner,
            evidence_builder=self.evidence_builder,
            queue=MockQueue(),
        )

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

    # ── Audio Worker ────────────────────────────────────────────────

    @property
    def audio_transcriber(self) -> IAudioTranscriber:
        if self._audio_transcriber is None:
            from app.audio_worker.transcriber import WhisperTranscriber
            self._audio_transcriber = WhisperTranscriber()
        return self._audio_transcriber

    @audio_transcriber.setter
    def audio_transcriber(self, transcriber: IAudioTranscriber) -> None:
        self._audio_transcriber = transcriber

    @property
    def audio_metadata_extractor(self) -> IAudioMetadataExtractor:
        if self._audio_metadata_extractor is None:
            from app.audio_worker.metadata_extractor import AudioMetadataExtractor
            self._audio_metadata_extractor = AudioMetadataExtractor()
        return self._audio_metadata_extractor

    @audio_metadata_extractor.setter
    def audio_metadata_extractor(self, extractor: IAudioMetadataExtractor) -> None:
        self._audio_metadata_extractor = extractor

    @property
    def audio_worker(self) -> AudioWorker:
        if self._audio_worker is None:
            from app.audio_worker.worker import AudioWorker
            from app.queue.mock_queue import MockQueue
            self._audio_worker = AudioWorker(
                transcriber=self.audio_transcriber,
                metadata_extractor=self.audio_metadata_extractor,
                queue=MockQueue(),
            )
        return self._audio_worker

    @audio_worker.setter
    def audio_worker(self, worker: AudioWorker) -> None:
        self._audio_worker = worker

    # ── Video Worker ────────────────────────────────────────────────

    @property
    def scene_detector(self) -> ISceneDetector:
        if self._scene_detector is None:
            from app.video_worker.scene_detector import PySceneDetector
            self._scene_detector = PySceneDetector(threshold=self._cfg.VIDEO_SCENE_THRESHOLD)
        return self._scene_detector

    @scene_detector.setter
    def scene_detector(self, detector: ISceneDetector) -> None:
        self._scene_detector = detector

    @property
    def keyframe_extractor(self) -> IKeyframeExtractor:
        if self._keyframe_extractor is None:
            from app.video_worker.keyframe_extractor import OpenCVKeyframeExtractor
            self._keyframe_extractor = OpenCVKeyframeExtractor()
        return self._keyframe_extractor

    @keyframe_extractor.setter
    def keyframe_extractor(self, extractor: IKeyframeExtractor) -> None:
        self._keyframe_extractor = extractor

    @property
    def video_audio_extractor(self) -> IAudioExtractor:
        if self._audio_extractor is None:
            from app.video_worker.audio_extractor import MoviePyAudioExtractor
            self._audio_extractor = MoviePyAudioExtractor()
        return self._audio_extractor

    @video_audio_extractor.setter
    def video_audio_extractor(self, extractor: IAudioExtractor) -> None:
        self._audio_extractor = extractor

    @property
    def video_metadata_extractor(self) -> IVideoMetadataExtractor:
        if self._video_metadata_extractor is None:
            from app.video_worker.metadata_extractor import OpenCVVideoMetadataExtractor
            self._video_metadata_extractor = OpenCVVideoMetadataExtractor()
        return self._video_metadata_extractor

    @video_metadata_extractor.setter
    def video_metadata_extractor(self, extractor: IVideoMetadataExtractor) -> None:
        self._video_metadata_extractor = extractor

    @property
    def video_worker(self) -> VideoWorker:
        if self._video_worker is None:
            from app.video_worker.worker import VideoWorker
            self._video_worker = VideoWorker(
                scene_detector=self.scene_detector,
                keyframe_extractor=self.keyframe_extractor,
                audio_extractor=self.video_audio_extractor,
                video_metadata_extractor=self.video_metadata_extractor,
                image_worker=self.image_worker,
                audio_worker=self.audio_worker,
                frames_per_scene=self._cfg.VIDEO_KEYFRAMES_PER_SCENE,
            )
        return self._video_worker

    @video_worker.setter
    def video_worker(self, worker: VideoWorker) -> None:
        self._video_worker = worker

    # ── PDF Worker ──────────────────────────────────────────────────

    @property
    def pdf_text_extractor(self) -> IPDFTextExtractor:
        if self._pdf_text_extractor is None:
            from app.pdf_worker.text_extractor import PyMuPDFTextExtractor
            self._pdf_text_extractor = PyMuPDFTextExtractor()
        return self._pdf_text_extractor

    @pdf_text_extractor.setter
    def pdf_text_extractor(self, extractor: IPDFTextExtractor) -> None:
        self._pdf_text_extractor = extractor

    @property
    def pdf_page_renderer(self) -> IPDFPageRenderer:
        if self._pdf_page_renderer is None:
            from app.pdf_worker.page_renderer import PyMuPDFPageRenderer
            self._pdf_page_renderer = PyMuPDFPageRenderer()
        return self._pdf_page_renderer

    @pdf_page_renderer.setter
    def pdf_page_renderer(self, renderer: IPDFPageRenderer) -> None:
        self._pdf_page_renderer = renderer

    @property
    def pdf_metadata_extractor(self) -> IPDFMetadataExtractor:
        if self._pdf_metadata_extractor is None:
            from app.pdf_worker.metadata_extractor import PyMuPDFMetadataExtractor
            self._pdf_metadata_extractor = PyMuPDFMetadataExtractor()
        return self._pdf_metadata_extractor

    @pdf_metadata_extractor.setter
    def pdf_metadata_extractor(self, extractor: IPDFMetadataExtractor) -> None:
        self._pdf_metadata_extractor = extractor

    @property
    def pdf_worker(self) -> PDFWorker:
        if self._pdf_worker is None:
            from app.pdf_worker.worker import PDFWorker
            from app.queue.mock_queue import MockQueue
            self._pdf_worker = PDFWorker(
                text_extractor=self.pdf_text_extractor,
                page_renderer=self.pdf_page_renderer,
                metadata_extractor=self.pdf_metadata_extractor,
                ocr_worker=self.ocr_worker,
                translator=self.translation_engine,
                queue=MockQueue(),
                digital_char_threshold=self._cfg.PDF_DIGITAL_CHAR_THRESHOLD,
                page_render_dpi=self._cfg.PDF_PAGE_RENDER_DPI,
            )
        return self._pdf_worker

    @pdf_worker.setter
    def pdf_worker(self, worker: PDFWorker) -> None:
        self._pdf_worker = worker

    # ── Single Case Understanding Engine ─────────────────────────────────────

    @property
    def case_context_builder(self):
        if self._case_context_builder is None:
            from app.case_understanding.context_builder import CaseContextBuilder
            self._case_context_builder = CaseContextBuilder()
        return self._case_context_builder

    @case_context_builder.setter
    def case_context_builder(self, builder) -> None:
        self._case_context_builder = builder

    @property
    def case_understanding_engine(self):
        if self._case_understanding_engine is None:
            from app.case_understanding.engine import CaseUnderstandingEngine
            self._case_understanding_engine = CaseUnderstandingEngine(
                llm_client=self.llm_client,
                max_retries=self._cfg.LLM_MAX_RETRIES,
            )
        return self._case_understanding_engine

    @case_understanding_engine.setter
    def case_understanding_engine(self, engine) -> None:
        self._case_understanding_engine = engine

    @property
    def case_repository(self):
        if self._case_repository is None:
            from app.case_understanding.repository import MongoCaseRepository
            self._case_repository = MongoCaseRepository()
        return self._case_repository

    @case_repository.setter
    def case_repository(self, repository) -> None:
        self._case_repository = repository


@lru_cache(maxsize=1)
def get_container() -> Container:
    """FastAPI dependency — returns the application-wide DI container."""
    logger.debug("Initialising DI container")
    return Container(cfg=settings)
