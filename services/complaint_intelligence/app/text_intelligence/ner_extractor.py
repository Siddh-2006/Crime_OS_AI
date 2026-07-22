"""
NER Extractors — interface-driven Named Entity Recognition.

SpacyNERExtractor: production implementation using spaCy's en_core_web_sm model.
MockNERExtractor:  deterministic mock returning pre-configured entities for testing.

Business logic codes against INERExtractor — never imports spaCy directly.
"""
from __future__ import annotations

from app.schemas.text_intelligence import ExtractedEntity
from app.text_intelligence.interfaces import INERExtractor


class SpacyNERExtractor(INERExtractor):
    """
    Production NER using spaCy's en_core_web_sm model.

    The model is loaded lazily on first call to avoid startup cost
    when the extractor is instantiated but not used.
    """

    # spaCy entity labels we care about for investigation
    _RELEVANT_LABELS = frozenset({
        "PERSON", "ORG", "GPE", "LOC",
        "DATE", "TIME", "MONEY", "EVENT",
        "FAC", "NORP", "PRODUCT",
    })

    def __init__(self) -> None:
        self._nlp = None

    def _load_model(self):
        """Lazy-load spaCy model. Raises ImportError if spacy/model not installed."""
        import os, sys, importlib.util
        # Windows: register torch DLL dir before spaCy/thinc tries to import torch
        if sys.platform == "win32":
            _spec = importlib.util.find_spec("torch")
            if _spec and _spec.origin:
                _lib = os.path.join(os.path.dirname(_spec.origin), "lib")
                if os.path.isdir(_lib):
                    try:
                        os.add_dll_directory(_lib)
                    except Exception:
                        pass
            # Pre-import torch so its DLLs are resident before thinc loads
            try:
                import torch as _t  # noqa: F401
            except Exception:
                pass
        import spacy  # noqa: local import — keeps spaCy off the import path for tests
        self._nlp = spacy.load("en_core_web_sm")

    async def extract(self, text: str) -> list[ExtractedEntity]:
        if self._nlp is None:
            self._load_model()

        doc = self._nlp(text)  # type: ignore[misc]
        results: list[ExtractedEntity] = []

        for ent in doc.ents:
            if ent.label_ not in self._RELEVANT_LABELS:
                continue
            results.append(
                ExtractedEntity(
                    entity_type=ent.label_,
                    value=ent.text,
                    source="ner",
                    start=ent.start_char,
                    end=ent.end_char,
                    confidence=0.85,  # spaCy sm model default confidence
                )
            )

        return results


class MockNERExtractor(INERExtractor):
    """
    Deterministic mock NER extractor for unit tests.
    Returns a pre-configured list of entities regardless of input.
    """

    def __init__(self, entities: list[ExtractedEntity] | None = None) -> None:
        self._entities = entities or []

    async def extract(self, text: str) -> list[ExtractedEntity]:
        return list(self._entities)
