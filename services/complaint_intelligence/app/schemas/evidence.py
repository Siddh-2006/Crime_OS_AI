"""
Evidence schemas — used by Image Worker (M4), OCR Worker (M5),
Audio Worker (M6), Video Worker (M7), and PDF Worker (M8).

ImageMetadata       — deterministic Pillow-extracted image properties.
ImageAnalysisResult — strongly typed Florence-2 output (never raw).
AudioMetadata       — mutagen/pydub-extracted audio properties.
TranscriptSegment   — per-segment Whisper output with timestamps.
AudioTranscript     — full Whisper transcript with optional translation.
VideoMetadata       — OpenCV/mutagen-extracted video properties.
SceneInfo           — PySceneDetect scene boundary with timestamps.
PDFMetadata         — pymupdf-extracted PDF document properties.
EvidenceProfile     — the complete, immutable evidence record.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field, ConfigDict, AliasChoices


class ImageMetadata(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    format: str = Field(description="Image format: JPEG, PNG, WEBP, etc.")
    width: int = Field(description="Image width in pixels.")
    height: int = Field(description="Image height in pixels.")
    color_mode: str = Field(
        validation_alias=AliasChoices("color_mode", "colorMode"),
        description="Pillow color mode: RGB, RGBA, L, etc.",
    )
    file_size_bytes: int = Field(
        validation_alias=AliasChoices("file_size_bytes", "fileSizeBytes"),
        description="Original file size in bytes.",
    )
    mime_type: str = Field(
        validation_alias=AliasChoices("mime_type", "mimeType"),
        description="MIME type derived from image format.",
    )
    exif_timestamp: str | None = Field(
        default=None,
        validation_alias=AliasChoices("exif_timestamp", "exifTimestamp"),
        description="DateTimeOriginal from EXIF (YYYY:MM:DD HH:MM:SS).",
    )
    gps_coordinates: dict[str, float] | None = Field(
        default=None,
        validation_alias=AliasChoices("gps_coordinates", "gpsCoordinates"),
        description='GPS decimal degrees: {"lat": 23.02, "lon": 72.57}.',
    )
    camera_make: str | None = Field(
        default=None,
        validation_alias=AliasChoices("camera_make", "cameraMake"),
        description="Camera manufacturer (EXIF Make tag).",
    )
    camera_model: str | None = Field(
        default=None,
        validation_alias=AliasChoices("camera_model", "cameraModel"),
        description="Camera model (EXIF Model tag).",
    )


class ImageAnalysisResult(BaseModel):
    """
    Strongly typed Florence-2 output.
    Business logic NEVER receives the raw Florence response — only this object.
    """
    model_config = ConfigDict(populate_by_name=True)

    description: str = Field(description="Human-readable scene description from Florence-2.")
    scene_type: str = Field(
        validation_alias=AliasChoices("scene_type", "sceneType"),
        description="Inferred scene category: outdoor, indoor, document, vehicle, other.",
    )
    tags: list[str] = Field(
        default_factory=list,
        description="Key visual elements extracted from the caption.",
    )
    confidence: float = Field(
        default=0.85,
        description="Confidence score between 0.0 and 1.0.",
    )
    contains_people: bool = Field(
        default=False,
        validation_alias=AliasChoices("contains_people", "containsPeople"),
    )
    contains_vehicles: bool = Field(
        default=False,
        validation_alias=AliasChoices("contains_vehicles", "containsVehicles"),
    )
    contains_weapons: bool = Field(
        default=False,
        validation_alias=AliasChoices("contains_weapons", "containsWeapons"),
    )
    contains_buildings: bool = Field(
        default=False,
        validation_alias=AliasChoices("contains_buildings", "containsBuildings"),
    )
    contains_documents: bool = Field(
        default=False,
        validation_alias=AliasChoices("contains_documents", "containsDocuments"),
    )


# ── Audio schemas ────────────────────────────────────────────────────────────────

class AudioMetadata(BaseModel):
    """Deterministic audio properties extracted by mutagen/pydub."""
    model_config = ConfigDict(populate_by_name=True)

    duration_seconds: float = Field(
        validation_alias=AliasChoices("duration_seconds", "durationSeconds"),
        description="Duration of the audio in seconds.",
    )
    sample_rate: int | None = Field(
        default=None,
        validation_alias=AliasChoices("sample_rate", "sampleRate"),
        description="Audio sample rate in Hz.",
    )
    channels: int | None = Field(
        default=None,
        description="Number of audio channels (1=mono, 2=stereo).",
    )
    codec: str | None = Field(
        default=None,
        description="Audio codec (mp3, wav, ogg, flac, aac, etc.).",
    )
    file_size_bytes: int = Field(
        validation_alias=AliasChoices("file_size_bytes", "fileSizeBytes"),
        description="Original file size in bytes.",
    )
    mime_type: str = Field(
        validation_alias=AliasChoices("mime_type", "mimeType"),
        description="MIME type of the audio file.",
    )
    bit_rate: int | None = Field(
        default=None,
        validation_alias=AliasChoices("bit_rate", "bitRate"),
        description="Bit rate in bps.",
    )


class TranscriptSegment(BaseModel):
    """A single Whisper transcript segment with timestamps."""
    model_config = ConfigDict(populate_by_name=True)

    start: float = Field(description="Segment start time in seconds.")
    end: float = Field(description="Segment end time in seconds.")
    text: str = Field(description="Transcribed text for this segment.")
    confidence: float = Field(
        default=0.0,
        description="Avg log-probability converted to 0–1 confidence score.",
    )


class AudioTranscript(BaseModel):
    """Structured Whisper output. Business logic never receives raw Whisper output."""
    model_config = ConfigDict(populate_by_name=True)

    detected_language: str = Field(
        validation_alias=AliasChoices("detected_language", "detectedLanguage"),
        description="BCP-47 language code detected by Whisper (e.g. 'en', 'hi').",
    )
    language_probability: float = Field(
        default=0.0,
        validation_alias=AliasChoices("language_probability", "languageProbability"),
        description="Whisper language detection confidence (0–1).",
    )
    raw_text: str = Field(
        validation_alias=AliasChoices("raw_text", "rawText"),
        description="Full transcript in the original detected language.",
    )
    translated_text: str | None = Field(
        default=None,
        validation_alias=AliasChoices("translated_text", "translatedText"),
        description="English translation (set only when source language is non-English).",
    )
    segments: list[TranscriptSegment] = Field(
        default_factory=list,
        description="Per-segment breakdown with timestamps and confidence.",
    )


# ── PDF schemas ────────────────────────────────────────────────────────────────

class PDFMetadata(BaseModel):
    """Deterministic PDF document properties extracted by pymupdf. No AI used."""
    model_config = ConfigDict(populate_by_name=True)

    page_count: int = Field(
        validation_alias=AliasChoices("page_count", "pageCount"),
        description="Total number of pages in the document.",
    )
    file_size_bytes: int = Field(
        validation_alias=AliasChoices("file_size_bytes", "fileSizeBytes"),
        description="Original file size in bytes.",
    )
    mime_type: str = Field(
        default="application/pdf",
        validation_alias=AliasChoices("mime_type", "mimeType"),
    )
    title: str | None = Field(default=None, description="PDF document title (from metadata).")  
    author: str | None = Field(default=None, description="PDF document author.")  
    producer: str | None = Field(default=None, description="PDF producer (tool that created it).")  
    creator: str | None = Field(default=None, description="PDF creator application.")  
    is_encrypted: bool = Field(
        default=False,
        validation_alias=AliasChoices("is_encrypted", "isEncrypted"),
        description="Whether the PDF is password-protected.",
    )


# ── Video schemas ────────────────────────────────────────────────────────────────

class VideoMetadata(BaseModel):
    """Deterministic video properties extracted by OpenCV + mutagen. No AI used."""
    model_config = ConfigDict(populate_by_name=True)

    duration_seconds: float = Field(
        validation_alias=AliasChoices("duration_seconds", "durationSeconds"),
        description="Video duration in seconds.",
    )
    fps: float = Field(description="Frames per second.")
    width: int = Field(description="Frame width in pixels.")
    height: int = Field(description="Frame height in pixels.")
    frame_count: int = Field(
        validation_alias=AliasChoices("frame_count", "frameCount"),
        description="Total number of frames.",
    )
    codec: str | None = Field(
        default=None,
        description="Video codec (h264, hevc, vp9, av1, etc.).",
    )
    has_audio: bool = Field(
        default=False,
        validation_alias=AliasChoices("has_audio", "hasAudio"),
        description="Whether the video file contains an audio track.",
    )
    file_size_bytes: int = Field(
        validation_alias=AliasChoices("file_size_bytes", "fileSizeBytes"),
        description="Original file size in bytes.",
    )
    mime_type: str = Field(
        validation_alias=AliasChoices("mime_type", "mimeType"),
        description="MIME type of the video file.",
    )


class SceneInfo(BaseModel):
    """A single scene detected by PySceneDetect ContentDetector."""
    model_config = ConfigDict(populate_by_name=True)

    scene_index: int = Field(
        validation_alias=AliasChoices("scene_index", "sceneIndex"),
        description="Zero-based scene index.",
    )
    start_time_s: float = Field(
        validation_alias=AliasChoices("start_time_s", "startTimeS"),
        description="Scene start time in seconds.",
    )
    end_time_s: float = Field(
        validation_alias=AliasChoices("end_time_s", "endTimeS"),
        description="Scene end time in seconds.",
    )

    @property
    def duration_s(self) -> float:
        return self.end_time_s - self.start_time_s

    @property
    def midpoint_s(self) -> float:
        return (self.start_time_s + self.end_time_s) / 2.0


class EvidenceProfile(BaseModel):
    """
    Immutable evidence record produced by the Image Worker.
    Consumed by Intelligence Fusion (M9) and Dashboard APIs (M13).
    """
    model_config = ConfigDict(populate_by_name=True)

    evidence_id: str = Field(
        validation_alias=AliasChoices("evidence_id", "evidenceId"),
        description="UUID identifying this evidence record.",
    )
    evidence_type: str = Field(
        validation_alias=AliasChoices("evidence_type", "evidenceType"),
        description="Evidence category: image, audio, pdf, video.",
    )
    file_name: str = Field(
        validation_alias=AliasChoices("file_name", "fileName"),
        description="Original uploaded filename.",
    )
    image_metadata: ImageMetadata | None = Field(
        default=None,
        validation_alias=AliasChoices("image_metadata", "imageMetadata"),
        description="PIL-extracted image properties.",
    )
    analysis: ImageAnalysisResult | None = Field(
        default=None,
        description="Florence-2 structured analysis (None when pending OCR).",
    )
    text_detected: bool = Field(
        default=False,
        validation_alias=AliasChoices("text_detected", "textDetected"),
        description="Whether readable text was detected in the image.",
    )
    ocr_job_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("ocr_job_id", "ocrJobId"),
        description="Job ID of the queued OCR_WORKER job (set when text detected).",
    )
    status: str = Field(
        description="Processing status: 'complete' or 'pending_ocr'.",
    )
    processing_duration_ms: float = Field(
        default=0.0,
        validation_alias=AliasChoices("processing_duration_ms", "processingDurationMs"),
        description="Total processing time in milliseconds.",
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        validation_alias=AliasChoices("created_at", "createdAt"),
    )
