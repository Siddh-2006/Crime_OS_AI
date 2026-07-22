"""
VideoWorkerOutput — the complete response returned by the Video Worker (M7).

Contains:
  - video_job_id           : the job ID of this video processing run
  - evidence_id            : UUID of the created evidence record
  - video_file_name        : original filename
  - video_metadata         : OpenCV/mutagen-extracted video properties
  - scenes                 : list of SceneInfo (detected scene boundaries)
  - frame_profiles         : list of VideoFrameProfile (ImageWorker output per keyframe)
  - audio_output           : AudioWorkerOutput dict (None if no audio track)
  - status                 : 'complete' | 'partial' (if some frames failed)
  - total_keyframes_processed : total frames sent through ImageWorker
  - processing_duration_ms : wall-clock time for the full pipeline
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, AliasChoices

from app.schemas.evidence import SceneInfo, VideoMetadata


class FrameType(str, Enum):
    START = "start"
    MIDDLE = "middle"
    END = "end"


class VideoFrameProfile(BaseModel):
    """
    Links a scene to one extracted keyframe's ImageWorker EvidenceProfile.
    Each scene produces up to VIDEO_KEYFRAMES_PER_SCENE VideoFrameProfile records.
    """
    model_config = ConfigDict(populate_by_name=True)

    scene_index: int = Field(
        validation_alias=AliasChoices("scene_index", "sceneIndex"),
        description="Zero-based scene index this frame belongs to.",
    )
    frame_type: FrameType = Field(
        validation_alias=AliasChoices("frame_type", "frameType"),
        description="Position within the scene: start, middle, or end.",
    )
    timestamp_s: float = Field(
        validation_alias=AliasChoices("timestamp_s", "timestampS"),
        description="Exact timestamp of this keyframe in seconds.",
    )
    image_job_id: str = Field(
        validation_alias=AliasChoices("image_job_id", "imageJobId"),
        description="Job ID of the ImageWorker run that produced this evidence profile.",
    )
    evidence_profile: dict = Field(
        validation_alias=AliasChoices("evidence_profile", "evidenceProfile"),
        description="Serialized EvidenceProfile from ImageWorker (never raw Florence output).",
    )


class VideoWorkerOutput(BaseModel):
    """
    Immutable video evidence record produced by VideoWorker.
    Consumed by Intelligence Fusion (M9) and Dashboard APIs (M13).
    """
    model_config = ConfigDict(populate_by_name=True)

    video_job_id: str = Field(
        validation_alias=AliasChoices("video_job_id", "videoJobId"),
        description="Job ID of this video processing run.",
    )
    evidence_id: str = Field(
        validation_alias=AliasChoices("evidence_id", "evidenceId"),
        description="UUID identifying this evidence record.",
    )
    video_file_name: str = Field(
        validation_alias=AliasChoices("video_file_name", "videoFileName"),
        description="Original uploaded filename.",
    )
    video_metadata: VideoMetadata = Field(
        validation_alias=AliasChoices("video_metadata", "videoMetadata"),
        description="Deterministic video properties (duration, fps, resolution, codec, etc.).",
    )
    scenes: list[SceneInfo] = Field(
        default_factory=list,
        description="Detected scene boundaries from PySceneDetect.",
    )
    frame_profiles: list[VideoFrameProfile] = Field(
        default_factory=list,
        validation_alias=AliasChoices("frame_profiles", "frameProfiles"),
        description="ImageWorker EvidenceProfile for each extracted keyframe.",
    )
    audio_output: dict | None = Field(
        default=None,
        validation_alias=AliasChoices("audio_output", "audioOutput"),
        description="Serialized AudioWorkerOutput (None if video has no audio track).",
    )
    status: str = Field(
        description="Processing status: 'complete' (all frames succeeded) or 'partial' (some failed).",
    )
    total_keyframes_processed: int = Field(
        default=0,
        validation_alias=AliasChoices("total_keyframes_processed", "totalKeyframesProcessed"),
        description="Total keyframes sent through ImageWorker.",
    )
    processing_duration_ms: float = Field(
        default=0.0,
        validation_alias=AliasChoices("processing_duration_ms", "processingDurationMs"),
        description="Total video processing time in milliseconds.",
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        validation_alias=AliasChoices("created_at", "createdAt"),
    )
