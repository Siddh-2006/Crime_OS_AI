"""
TextIntelligenceWorker — orchestrates the full text intelligence pipeline.

Steps:
  1. NER extraction (via INERExtractor)
  2. Regex extraction (via IRegexExtractor)
  3. Merge + deduplicate entities
  4. Event extraction (via IEventExtractor)
  5. Entity linking (via IEntityLinker)
  6. Build & validate TextIntelligenceResult
"""
from __future__ import annotations

import time

from app.base.worker import BaseWorker, ProgressUpdate
from app.schemas.text_intelligence import ExtractedEntity, TextIntelligenceResult
from app.text_intelligence.interfaces import (
    IEntityLinker,
    IEventExtractor,
    INERExtractor,
    IRegexExtractor,
)


class TextIntelligenceWorker(BaseWorker[dict, dict]):
    """
    Worker that runs the complete text intelligence pipeline.

    Accepts payload:
        {"text": "...", "source_type": "complaint|ocr|audio|pdf"}

    Returns:
        TextIntelligenceResult as a dict.
    """

    worker_name = "text_intelligence_worker"

    def __init__(
        self,
        ner_extractor: INERExtractor,
        regex_extractor: IRegexExtractor,
        event_extractor: IEventExtractor,
        entity_linker: IEntityLinker,
    ) -> None:
        super().__init__()
        self.ner_extractor = ner_extractor
        self.regex_extractor = regex_extractor
        self.event_extractor = event_extractor
        self.entity_linker = entity_linker

    async def process(self, *, job_id: str, payload: dict, attempt: int) -> dict:
        text = payload.get("text")
        if not text:
            raise ValueError("Payload must contain 'text'")

        source_type = payload.get("source_type", "complaint")
        t_start = time.perf_counter()

        # Step 1: NER extraction
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="ner_extraction", percent=0.1, message="Running NER extraction")
        )
        ner_entities = await self.ner_extractor.extract(text)

        # Step 2: Regex extraction
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="regex_extraction", percent=0.3, message="Running regex extraction")
        )
        regex_entities = await self.regex_extractor.extract(text)

        # Step 3: Merge + deduplicate
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="deduplication", percent=0.5, message="Merging and deduplicating entities")
        )
        merged = self._deduplicate(ner_entities + regex_entities)

        # Step 4: Event extraction
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="event_extraction", percent=0.7, message="Extracting events")
        )
        events = await self.event_extractor.extract(text, merged)

        # Step 5: Entity linking
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="entity_linking", percent=0.85, message="Linking entities")
        )
        linked = await self.entity_linker.link(merged)

        # Step 6: Build result
        duration_ms = (time.perf_counter() - t_start) * 1000
        result = TextIntelligenceResult(
            entities=linked,
            events=events,
            source_type=source_type,
            input_text_length=len(text),
            processing_duration_ms=round(duration_ms, 2),
        )

        self.report_progress(
            ProgressUpdate(job_id=job_id, step="completed", percent=1.0, message="Text intelligence complete")
        )
        return result.model_dump()

    @staticmethod
    def _deduplicate(entities: list[ExtractedEntity]) -> list[ExtractedEntity]:
        """
        Remove duplicate entities that share the same value and type.
        When a duplicate exists, prefer the one with the higher confidence.
        """
        seen: dict[tuple[str, str], ExtractedEntity] = {}
        for ent in entities:
            key = (ent.entity_type, ent.value)
            existing = seen.get(key)
            if existing is None or ent.confidence > existing.confidence:
                seen[key] = ent
        return list(seen.values())
