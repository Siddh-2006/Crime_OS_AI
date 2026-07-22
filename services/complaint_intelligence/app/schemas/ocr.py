"""M5 OCR Worker — Schemas.

All OCR output is converted to these strongly-typed models before leaving
the ocr_worker module. No raw PaddleOCR output ever crosses this boundary.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    """Pixel-space bounding box (top-left origin)."""
    x1: float
    y1: float
    x2: float
    y2: float

    @classmethod
    def from_paddle(cls, points: list[list[float]]) -> "BoundingBox":
        """Convert PaddleOCR [[x,y], [x,y], [x,y], [x,y]] quad to AABB."""
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        return cls(x1=min(xs), y1=min(ys), x2=max(xs), y2=max(ys))


class OCRLine(BaseModel):
    """A single detected text line with its bounding box and confidence."""
    text: str
    confidence: float = Field(ge=0.0, le=1.0)
    bounding_box: BoundingBox


class OCRResult(BaseModel):
    """Fully structured OCR output — never contains raw PaddleOCR objects."""
    # Raw concatenated text (all lines joined by newline)
    raw_text: str

    # Structured lines with spatial information
    lines: list[OCRLine]

    # Language detection
    detected_language: str = "en"   # ISO 639-1 code

    # Translation (None when already English)
    translated_text: str | None = None

    # Summary metrics
    word_count: int = 0
    line_count: int = 0
    average_confidence: float = 0.0
    processing_duration_ms: float = 0.0


class OCRWorkerOutput(BaseModel):
    """Full payload returned by OCRWorker, including metadata."""
    ocr_job_id: str
    evidence_id: str | None = None    # links back to the ImageWorker EvidenceProfile
    image_file_name: str
    ocr_result: OCRResult
    text_intelligence_job_id: str | None = None  # set if TI job was enqueued
    status: str = "complete"          # "complete" | "failed"
    error: str | None = None
