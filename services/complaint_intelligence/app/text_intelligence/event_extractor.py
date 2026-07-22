"""
TemporalEventExtractor — deterministic event extraction from text.

Scans sentences for temporal markers (DATE, TIME entities) and builds
structured ExtractedEvent objects using nearby PERSON/ORG/GPE entities.

No LLM is used. Relies entirely on the entity list + sentence splitting.
"""
from __future__ import annotations

import re
import uuid

from app.schemas.text_intelligence import ExtractedEntity, ExtractedEvent
from app.text_intelligence.interfaces import IEventExtractor

# Sentence splitter (simple but effective for investigative reports)
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")

# Action keywords common in investigation texts
_ACTION_VERBS = re.compile(
    r"\b(debited|credited|transferred|deposited|withdrew|received|sent|paid|"
    r"called|threatened|assaulted|reported|arrested|escaped|fled|stole|"
    r"kidnapped|murdered|robbed|attacked|contacted|cheated|fraudulently|"
    r"forged|extorted|abused|harassed|blackmailed|demanded|collected|"
    r"purchased|sold|hacked|accessed|deleted|uploaded|downloaded)\b",
    re.IGNORECASE,
)


class TemporalEventExtractor(IEventExtractor):
    """
    Deterministic event extraction: finds sentences with temporal markers
    and structures them into events with actors, actions, timestamps, locations.
    """

    async def extract(
        self, text: str, entities: list[ExtractedEntity]
    ) -> list[ExtractedEvent]:
        sentences = _SENTENCE_SPLIT.split(text.strip())
        events: list[ExtractedEvent] = []

        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue

            # Find the approximate offset of this sentence in the original text
            sent_start = text.find(sentence)
            sent_end = sent_start + len(sentence) if sent_start >= 0 else -1

            # Collect entities that fall within this sentence
            sent_entities = self._entities_in_range(entities, sent_start, sent_end)

            # Only create an event if the sentence has a temporal marker
            temporal_entities = [
                e for e in sent_entities
                if e.entity_type in ("DATE", "TIME", "date", "time")
            ]
            if not temporal_entities:
                continue

            # Extract actors (PERSON, ORG)
            actors = [
                e.value for e in sent_entities
                if e.entity_type in ("PERSON", "ORG")
            ]

            # Extract locations (GPE, LOC)
            locations = [
                e.value for e in sent_entities
                if e.entity_type in ("GPE", "LOC")
            ]

            # Extract primary action verb
            action_match = _ACTION_VERBS.search(sentence)
            action = action_match.group(0).lower() if action_match else ""

            # Use the first temporal entity as the timestamp
            timestamp = temporal_entities[0].value

            events.append(
                ExtractedEvent(
                    event_id=f"evt-{uuid.uuid4().hex[:8]}",
                    description=sentence[:200],  # cap at 200 chars
                    actors=actors,
                    action=action,
                    timestamp=timestamp,
                    location=locations[0] if locations else None,
                    source_text=sentence,
                )
            )

        return events

    @staticmethod
    def _entities_in_range(
        entities: list[ExtractedEntity], start: int, end: int
    ) -> list[ExtractedEntity]:
        """Return entities whose span overlaps [start, end)."""
        if start < 0 or end < 0:
            return list(entities)  # fallback: return all

        result: list[ExtractedEntity] = []
        for ent in entities:
            if ent.start is None or ent.end is None:
                # Entity without offsets — include if we can't verify
                result.append(ent)
                continue
            if ent.start >= start and ent.end <= end:
                result.append(ent)
        return result
