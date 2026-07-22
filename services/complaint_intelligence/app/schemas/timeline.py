"""
Pydantic schemas for Milestone 10 — Deterministic Timeline Engine.

ParsedDateTime  — Strongly-typed, normalized representation of a date-time expression.
TimelineEntry   — Individual timeline entry tied to a fused event and parsed timestamp.
Timeline        — The complete, chronologically sorted timeline produced for an InvestigationContext.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, AliasChoices


class TimestampPrecision(str, Enum):
    SECOND = "second"
    MINUTE = "minute"
    HOUR = "hour"
    DAY = "day"
    MONTH = "month"
    YEAR = "year"
    UNPARSED = "unparsed"


class ParsedDateTime(BaseModel):
    """
    Normalized date-time expression parsed deterministically without an LLM.
    """
    model_config = ConfigDict(populate_by_name=True)

    iso_timestamp_utc: str | None = Field(
        default=None,
        validation_alias=AliasChoices("iso_timestamp_utc", "isoTimestampUtc"),
        description="ISO-8601 UTC timestamp string (e.g. '2026-07-20T10:00:00Z').",
    )
    year: int | None = Field(default=None)
    month: int | None = Field(default=None)
    day: int | None = Field(default=None)
    hour: int | None = Field(default=None)
    minute: int | None = Field(default=None)
    second: int | None = Field(default=None)
    precision: TimestampPrecision = Field(
        default=TimestampPrecision.UNPARSED,
        description="Granularity of the parsed date-time.",
    )
    raw_text: str = Field(
        default="",
        validation_alias=AliasChoices("raw_text", "rawText"),
        description="Original raw timestamp text string.",
    )


class TimelineEntry(BaseModel):
    """A single timeline entry in the chronological sequence."""
    model_config = ConfigDict(populate_by_name=True)

    entry_id: str = Field(
        validation_alias=AliasChoices("entry_id", "entryId"),
        description="UUID identifying this timeline entry.",
    )
    event_id: str = Field(
        validation_alias=AliasChoices("event_id", "eventId"),
        description="ID of the underlying MergedEvent.",
    )
    description: str = Field(
        description="Canonical description of the event.",
    )
    actors: list[str] = Field(
        default_factory=list,
        description="Actors associated with this timeline entry.",
    )
    action: str = Field(
        default="",
        description="Primary action.",
    )
    raw_timestamp: str | None = Field(
        default=None,
        validation_alias=AliasChoices("raw_timestamp", "rawTimestamp"),
        description="Raw temporal marker string from original text.",
    )
    parsed_time: ParsedDateTime = Field(
        validation_alias=AliasChoices("parsed_time", "parsedTime"),
        description="Normalized, structured date-time model.",
    )
    location: str | None = Field(default=None)
    sources: list[str] = Field(default_factory=list)
    confidence: float = Field(default=1.0)


class Timeline(BaseModel):
    """
    The complete, chronologically ordered timeline artifact.
    Consumed by Timeline Intelligence (M11) and Dashboard (M13).
    """
    model_config = ConfigDict(populate_by_name=True)

    timeline_id: str = Field(
        validation_alias=AliasChoices("timeline_id", "timelineId"),
        description="UUID identifying this timeline.",
    )
    context_id: str = Field(
        validation_alias=AliasChoices("context_id", "contextId"),
        description="UUID of the source InvestigationContext.",
    )
    entries: list[TimelineEntry] = Field(
        default_factory=list,
        description="Chronologically sorted list of timeline entries.",
    )
    start_time: str | None = Field(
        default=None,
        validation_alias=AliasChoices("start_time", "startTime"),
        description="ISO-8601 UTC timestamp of the earliest timeline entry.",
    )
    end_time: str | None = Field(
        default=None,
        validation_alias=AliasChoices("end_time", "endTime"),
        description="ISO-8601 UTC timestamp of the latest timeline entry.",
    )
    total_events: int = Field(
        default=0,
        validation_alias=AliasChoices("total_events", "totalEvents"),
    )
    unparsed_count: int = Field(
        default=0,
        validation_alias=AliasChoices("unparsed_count", "unparsedCount"),
        description="Count of entries with unparsed / missing timestamps.",
    )
    processing_duration_ms: float = Field(
        default=0.0,
        validation_alias=AliasChoices("processing_duration_ms", "processingDurationMs"),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        validation_alias=AliasChoices("created_at", "createdAt"),
    )
