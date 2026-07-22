"""
Pydantic schemas for Milestone 9 — Intelligence Fusion.

MergedEntity         — Deduplicated entity representation aggregated across multiple sources.
MergedEvent          — Canonical event merged across complaint and evidence profiles.
EvidenceRef          — Reference to an evidence document/file included in fusion.
FusionInput          — Input payload containing complaint profile, extracted entities/events, and evidence links.
InvestigationContext — The single consolidated intelligence view produced by Intelligence Fusion.
"""
from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, AliasChoices

from app.schemas.complaint import ComplaintProfile
from app.schemas.text_intelligence import ExtractedEntity, ExtractedEvent


class MergedEntity(BaseModel):
    """
    Deduplicated and merged entity across all sources (complaint, OCR, audio, video, PDF).
    """
    model_config = ConfigDict(populate_by_name=True)

    entity_type: str = Field(
        validation_alias=AliasChoices("entity_type", "entityType"),
        description="Category of entity (PERSON, ORG, GPE, phone, email, aadhaar, pan, etc.).",
    )
    canonical_value: str = Field(
        validation_alias=AliasChoices("canonical_value", "canonicalValue"),
        description="Clean, normalized representative value.",
    )
    raw_values: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("raw_values", "rawValues"),
        description="Distinct raw strings extracted across inputs.",
    )
    sources: list[str] = Field(
        default_factory=list,
        description="Source identifiers where this entity appeared (e.g. 'complaint', 'evidence_audio_1').",
    )
    confidence: float = Field(
        default=1.0,
        description="Highest confidence score among all merged occurrences.",
    )
    occurrence_count: int = Field(
        default=1,
        validation_alias=AliasChoices("occurrence_count", "occurrenceCount"),
        description="Total number of times this entity was detected.",
    )


class MergedEvent(BaseModel):
    """
    Canonical event merged across complaint narrative and evidence items.
    """
    model_config = ConfigDict(populate_by_name=True)

    event_id: str = Field(
        validation_alias=AliasChoices("event_id", "eventId"),
        description="Unique identifier for the merged event.",
    )
    description: str = Field(
        description="Canonical description of the event.",
    )
    actors: list[str] = Field(
        default_factory=list,
        description="Deduplicated list of people or organisations involved.",
    )
    action: str = Field(
        default="",
        description="Primary verb / action.",
    )
    timestamp: str | None = Field(
        default=None,
        description="Temporal marker associated with the event.",
    )
    location: str | None = Field(
        default=None,
        description="Location associated with the event.",
    )
    sources: list[str] = Field(
        default_factory=list,
        description="List of source provenance identifiers.",
    )
    confidence: float = Field(
        default=1.0,
        description="Highest confidence score among merged instances.",
    )


class EvidenceRef(BaseModel):
    """Reference to an evidence document/file included in fusion."""
    model_config = ConfigDict(populate_by_name=True)

    evidence_id: str = Field(
        validation_alias=AliasChoices("evidence_id", "evidenceId"),
        description="UUID of the evidence profile.",
    )
    evidence_type: str = Field(
        validation_alias=AliasChoices("evidence_type", "evidenceType"),
        description="Category: image, ocr, audio, video, pdf.",
    )
    file_name: str = Field(
        validation_alias=AliasChoices("file_name", "fileName"),
        description="Filename of the evidence item.",
    )


class FusionInput(BaseModel):
    """Input payload for Intelligence Fusion."""
    model_config = ConfigDict(populate_by_name=True)

    complaint_profile: ComplaintProfile = Field(
        validation_alias=AliasChoices("complaint_profile", "complaintProfile"),
        description="Structured complaint profile from M1 ComplaintWorker.",
    )
    entities: list[ExtractedEntity] = Field(
        default_factory=list,
        description="Extracted entities from complaint and evidence profiles.",
    )
    events: list[ExtractedEvent] = Field(
        default_factory=list,
        description="Extracted events from complaint and evidence profiles.",
    )
    evidence_references: list[EvidenceRef] = Field(
        default_factory=list,
        validation_alias=AliasChoices("evidence_references", "evidenceReferences"),
        description="Metadata of evidence items included in fusion.",
    )


class InvestigationContext(BaseModel):
    """
    The unified, consolidated intelligence view produced by Intelligence Fusion (M9).
    Consumed by Timeline Engine (M10), Graph Engine (M11), and Dashboard (M13).
    """
    model_config = ConfigDict(populate_by_name=True)

    context_id: str = Field(
        validation_alias=AliasChoices("context_id", "contextId"),
        description="UUID identifying this investigation context.",
    )
    complaint_profile: ComplaintProfile = Field(
        validation_alias=AliasChoices("complaint_profile", "complaintProfile"),
        description="The primary complaint profile.",
    )
    entities: list[MergedEntity] = Field(
        default_factory=list,
        description="Deduplicated, cross-source merged entities.",
    )
    events: list[MergedEvent] = Field(
        default_factory=list,
        description="Deduplicated, chronologically ordered merged events.",
    )
    evidence_sources: list[EvidenceRef] = Field(
        default_factory=list,
        validation_alias=AliasChoices("evidence_sources", "evidenceSources"),
        description="Summary of evidence sources incorporated in this context.",
    )
    total_entities_fused: int = Field(
        default=0,
        validation_alias=AliasChoices("total_entities_fused", "totalEntitiesFused"),
    )
    total_events_fused: int = Field(
        default=0,
        validation_alias=AliasChoices("total_events_fused", "totalEventsFused"),
    )
    processing_duration_ms: float = Field(
        default=0.0,
        validation_alias=AliasChoices("processing_duration_ms", "processingDurationMs"),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        validation_alias=AliasChoices("created_at", "createdAt"),
    )
