"""
AudioWorkerOutput — the complete response returned by the Audio Worker (M6).

Mirrors OCRWorkerOutput (M5) in structure:
  - audio_job_id            : the job ID of this audio processing run
  - evidence_id             : UUID of the created evidence record
  - audio_file_name         : original filename
  - audio_metadata          : mutagen/pydub-extracted audio properties
  - transcript              : structured Whisper output (never raw model output)
  - text_intelligence_job_id: job ID of the downstream TI job (if text was found)
  - status                  : 'complete' | 'no_speech'
  - processing_duration_ms  : wall-clock time for the full pipeline
"""
from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, Field, ConfigDict, AliasChoices

from app.schemas.evidence import AudioMetadata, AudioTranscript


class AudioWorkerOutput(BaseModel):
    """
    Immutable audio evidence record produced by AudioWorker.
    Consumed by Intelligence Fusion (M9) and Dashboard APIs (M13).
    """
    model_config = ConfigDict(populate_by_name=True)

    audio_job_id: str = Field(
        validation_alias=AliasChoices("audio_job_id", "audioJobId"),
        description="Job ID of this audio processing run.",
    )
    evidence_id: str = Field(
        validation_alias=AliasChoices("evidence_id", "evidenceId"),
        description="UUID identifying this evidence record.",
    )
    audio_file_name: str = Field(
        validation_alias=AliasChoices("audio_file_name", "audioFileName"),
        description="Original uploaded filename.",
    )
    audio_metadata: AudioMetadata = Field(
        validation_alias=AliasChoices("audio_metadata", "audioMetadata"),
        description="Deterministic audio properties (duration, codec, etc.).",
    )
    transcript: AudioTranscript = Field(
        description="Structured Whisper transcript (never raw model output).",
    )
    text_intelligence_job_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("text_intelligence_job_id", "textIntelligenceJobId"),
        description="Job ID of the downstream TEXT_INTELLIGENCE job (None when no speech detected).",
    )
    status: str = Field(
        description="Processing status: 'complete' (speech found) or 'no_speech' (silent/empty audio).",
    )
    processing_duration_ms: float = Field(
        default=0.0,
        validation_alias=AliasChoices("processing_duration_ms", "processingDurationMs"),
        description="Total audio processing time in milliseconds.",
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        validation_alias=AliasChoices("created_at", "createdAt"),
    )
