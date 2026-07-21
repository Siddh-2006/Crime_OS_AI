"""
Evidence schemas — used by Image Worker (M4), OCR Worker (M5),
Audio Worker (M6), Video Worker (M7), and PDF Worker (M8).

ImageMetadata      — deterministic Pillow-extracted image properties.
ImageAnalysisResult — strongly typed Florence-2 output (never raw).
EvidenceProfile    — the complete, immutable evidence record.
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
