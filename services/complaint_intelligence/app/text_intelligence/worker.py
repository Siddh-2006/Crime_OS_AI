"""
Text Intelligence Worker - M3 & M6 Text Analysis.
Orchestrates NER, regex extraction, temporal event detection, and entity linking.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.logging import logger


@dataclass
class TextIntelligenceResult:
    """Result of text intelligence processing."""
    succeeded: bool
    entities: list[Any] = None
    regex_matches: list[Any] = None
    temporal_events: list[Any] = None
    linked_entities: list[Any] = None
    error: str | None = None


class TextIntelligenceWorker:
    """Worker for text intelligence processing."""
    
    def __init__(self, ner_extractor, regex_extractor, event_extractor, entity_linker):
        """Initialize text intelligence worker."""
        self.ner_extractor = ner_extractor
        self.regex_extractor = regex_extractor
        self.event_extractor = event_extractor
        self.entity_linker = entity_linker
    
    async def run(self, payload: dict[str, Any], job_id: str) -> TextIntelligenceResult:
        """
        Run text intelligence analysis.
        
        Args:
            payload: Dictionary with 'text' key containing complaint text
            job_id: Unique job identifier
            
        Returns:
            TextIntelligenceResult with analysis results
        """
        try:
            text = payload.get("text", "").strip()
            if not text:
                return TextIntelligenceResult(
                    succeeded=False,
                    error="No text provided"
                )
            
            # Extract entities using NER
            entities = await self.ner_extractor.extract(text)
            
            # Extract regex patterns
            regex_matches = await self.regex_extractor.extract(text)
            
            # Extract temporal events
            temporal_events = await self.event_extractor.extract(text)
            
            # Link entities
            linked_entities = await self.entity_linker.link(entities)
            
            logger.info(
                "Text intelligence analysis completed",
                extra={
                    "job_id": job_id,
                    "entities": len(entities),
                    "regex_matches": len(regex_matches),
                    "temporal_events": len(temporal_events),
                }
            )
            
            return TextIntelligenceResult(
                succeeded=True,
                entities=entities,
                regex_matches=regex_matches,
                temporal_events=temporal_events,
                linked_entities=linked_entities,
            )
        
        except Exception as e:
            logger.error(
                "Text intelligence analysis failed",
                extra={"job_id": job_id, "error": str(e)}
            )
            return TextIntelligenceResult(
                succeeded=False,
                error=str(e)
            )
