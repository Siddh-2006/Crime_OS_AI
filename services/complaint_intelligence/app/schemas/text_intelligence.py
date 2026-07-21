"""
Pydantic schemas for Text Intelligence Pipeline output.

ExtractedEntity — a single NER or regex-detected entity.
ExtractedEvent  — a structured event extracted from temporal context.
TextIntelligenceResult — the top-level pipeline output, deterministic JSON.
"""
from __future__ import annotations

from pydantic import BaseModel, Field, ConfigDict, AliasChoices


class ExtractedEntity(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    entity_type: str = Field(
        validation_alias=AliasChoices("entity_type", "entityType"),
        description="Type of entity (PERSON, ORG, GPE, phone, email, aadhaar, pan, etc.)",
    )
    value: str = Field(
        description="The raw value extracted from text.",
    )
    source: str = Field(
        description="Extraction source: 'ner' or 'regex'.",
    )
    start: int | None = Field(
        default=None,
        description="Start character offset in the source text (inclusive).",
    )
    end: int | None = Field(
        default=None,
        description="End character offset in the source text (exclusive).",
    )
    confidence: float = Field(
        default=1.0,
        description="Confidence score between 0.0 and 1.0.",
    )


class ExtractedEvent(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    event_id: str = Field(
        validation_alias=AliasChoices("event_id", "eventId"),
        description="Unique identifier for this event.",
    )
    description: str = Field(
        description="Human-readable event description.",
    )
    actors: list[str] = Field(
        default_factory=list,
        description="People or organisations involved in the event.",
    )
    action: str = Field(
        default="",
        description="Primary verb / action of the event.",
    )
    timestamp: str | None = Field(
        default=None,
        description="Temporal marker associated with the event.",
    )
    location: str | None = Field(
        default=None,
        description="Location associated with the event.",
    )
    source_text: str = Field(
        default="",
        validation_alias=AliasChoices("source_text", "sourceText"),
        description="The original sentence from which this event was extracted.",
    )


class TextIntelligenceResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    entities: list[ExtractedEntity] = Field(
        default_factory=list,
        description="All extracted entities (NER + regex).",
    )
    events: list[ExtractedEvent] = Field(
        default_factory=list,
        description="Structured events extracted from temporal context.",
    )
    source_type: str = Field(
        validation_alias=AliasChoices("source_type", "sourceType"),
        description="Origin of the input text: complaint, ocr, audio, or pdf.",
    )
    input_text_length: int = Field(
        default=0,
        validation_alias=AliasChoices("input_text_length", "inputTextLength"),
        description="Character length of the input text.",
    )
    processing_duration_ms: float = Field(
        default=0.0,
        validation_alias=AliasChoices("processing_duration_ms", "processingDurationMs"),
        description="Total processing time in milliseconds.",
    )
