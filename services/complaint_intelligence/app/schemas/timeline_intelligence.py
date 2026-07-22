"""
Pydantic schemas for Milestone 11 — Timeline Intelligence.

RefinedTimelineEntry       — LLM-refined event with improved wording and resolved actors.
TimelineContradiction      — Contradiction detected between complaint and evidence.
CausalRelationship         — Inferred cause-and-effect pair between two events.
MissingTimestampHighlight  — Event flagged for missing or unparseable timestamp.
TimelineIntelligenceInput  — Input payload accepted by the engine.
TimelineIntelligence       — Complete output of the Timeline Intelligence analysis.
"""
from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, AliasChoices

from app.schemas.complaint import ComplaintProfile
from app.schemas.fusion import EvidenceRef
from app.schemas.timeline import ParsedDateTime, Timeline


class RefinedTimelineEntry(BaseModel):
    """LLM-refined version of a timeline entry."""
    model_config = ConfigDict(populate_by_name=True)

    entry_id: str = Field(
        validation_alias=AliasChoices("entry_id", "entryId"),
    )
    event_id: str = Field(
        validation_alias=AliasChoices("event_id", "eventId"),
    )
    original_description: str = Field(
        validation_alias=AliasChoices("original_description", "originalDescription"),
        description="Original event description from the deterministic timeline.",
    )
    refined_description: str = Field(
        validation_alias=AliasChoices("refined_description", "refinedDescription"),
        description="Improved, professional wording from the LLM — no new facts added.",
    )
    resolved_actors: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("resolved_actors", "resolvedActors"),
        description="Actors with resolved references (pronouns resolved to names).",
    )
    action: str = Field(default="")
    parsed_time: ParsedDateTime = Field(
        validation_alias=AliasChoices("parsed_time", "parsedTime"),
    )
    location: str | None = Field(default=None)
    sources: list[str] = Field(default_factory=list)


class TimelineContradiction(BaseModel):
    """A contradiction detected between complaint and/or evidence entries."""
    model_config = ConfigDict(populate_by_name=True)

    contradiction_id: str = Field(
        validation_alias=AliasChoices("contradiction_id", "contradictionId"),
    )
    contradiction_type: str = Field(
        validation_alias=AliasChoices("contradiction_type", "contradictionType"),
        description="timestamp_mismatch | fact_conflict | actor_discrepancy",
    )
    description: str = Field(
        description="Human-readable explanation of the contradiction.",
    )
    conflicting_event_ids: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("conflicting_event_ids", "conflictingEventIds"),
    )
    severity: str = Field(
        default="medium",
        description="low | medium | high | critical",
    )


class CausalRelationship(BaseModel):
    """An inferred causal link between two timeline events."""
    model_config = ConfigDict(populate_by_name=True)

    link_id: str = Field(
        validation_alias=AliasChoices("link_id", "linkId"),
    )
    cause_event_id: str = Field(
        validation_alias=AliasChoices("cause_event_id", "causeEventId"),
    )
    effect_event_id: str = Field(
        validation_alias=AliasChoices("effect_event_id", "effectEventId"),
    )
    reasoning: str = Field(
        description="Explanation of why this causal relationship is inferred.",
    )


class MissingTimestampHighlight(BaseModel):
    """An event flagged for missing, vague, or unparseable timestamp."""
    model_config = ConfigDict(populate_by_name=True)

    event_id: str = Field(
        validation_alias=AliasChoices("event_id", "eventId"),
    )
    description: str = Field(
        description="Description of the event with missing timestamp.",
    )
    impact: str = Field(
        description="Investigation impact of the missing timestamp.",
    )
    suggested_window: str | None = Field(
        default=None,
        validation_alias=AliasChoices("suggested_window", "suggestedWindow"),
        description="Suggested temporal window inferred from adjacent events (if any).",
    )


class TimelineIntelligenceInput(BaseModel):
    """Input payload for Timeline Intelligence Engine."""
    model_config = ConfigDict(populate_by_name=True)

    complaint_profile: ComplaintProfile = Field(
        validation_alias=AliasChoices("complaint_profile", "complaintProfile"),
    )
    timeline: Timeline = Field(
        description="Deterministic timeline produced by M10.",
    )
    evidence_references: list[EvidenceRef] = Field(
        default_factory=list,
        validation_alias=AliasChoices("evidence_references", "evidenceReferences"),
    )


class TimelineIntelligence(BaseModel):
    """
    Complete Timeline Intelligence analysis produced by M11.
    Consumed by Investigation Intelligence (M12) and Dashboard (M13).
    """
    model_config = ConfigDict(populate_by_name=True)

    intelligence_id: str = Field(
        validation_alias=AliasChoices("intelligence_id", "intelligenceId"),
        description="UUID identifying this intelligence report.",
    )
    timeline_id: str = Field(
        validation_alias=AliasChoices("timeline_id", "timelineId"),
        description="UUID of the source M10 Timeline.",
    )
    summary: str = Field(
        description="Coherent chronological narrative of the investigation timeline.",
    )
    refined_entries: list[RefinedTimelineEntry] = Field(
        default_factory=list,
        validation_alias=AliasChoices("refined_entries", "refinedEntries"),
    )
    contradictions: list[TimelineContradiction] = Field(
        default_factory=list,
    )
    causal_relationships: list[CausalRelationship] = Field(
        default_factory=list,
        validation_alias=AliasChoices("causal_relationships", "causalRelationships"),
    )
    missing_timestamp_highlights: list[MissingTimestampHighlight] = Field(
        default_factory=list,
        validation_alias=AliasChoices("missing_timestamp_highlights", "missingTimestampHighlights"),
    )
    processing_duration_ms: float = Field(
        default=0.0,
        validation_alias=AliasChoices("processing_duration_ms", "processingDurationMs"),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        validation_alias=AliasChoices("created_at", "createdAt"),
    )
