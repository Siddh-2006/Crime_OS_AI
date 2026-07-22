"""
PDFWorkerOutput — the complete response returned by the PDF Worker (M8).

Contains:
  - pdf_job_id          : job ID of this PDF processing run
  - evidence_id         : UUID of the created evidence record
  - pdf_file_name       : original filename
  - pdf_metadata        : pymupdf-extracted document properties
  - pages               : per-page results (type, text, OCR job ID if scanned)
  - merged_text         : all page texts concatenated (English)
  - text_intelligence_job_id : TI job queued with merged_text
  - status              : 'complete' | 'partial' (some pages failed)
  - processing_duration_ms
  - created_at
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, AliasChoices

from app.schemas.evidence import PDFMetadata


class PDFPageType(str, Enum):
    DIGITAL = "digital"   # text extracted directly by pymupdf
    SCANNED = "scanned"   # page rendered to image and run through OCRWorker


class PDFPageResult(BaseModel):
    """Result for a single PDF page — either digitally extracted or OCR'd."""
    model_config = ConfigDict(populate_by_name=True)

    page_index: int = Field(
        validation_alias=AliasChoices("page_index", "pageIndex"),
        description="Zero-based page index.",
    )
    page_type: PDFPageType = Field(
        validation_alias=AliasChoices("page_type", "pageType"),
        description="'digital' if text was extracted directly; 'scanned' if OCR was used.",
    )
    raw_text: str = Field(
        default="",
        validation_alias=AliasChoices("raw_text", "rawText"),
        description="Text as extracted (may be in original language for digital pages).",
    )
    translated_text: str | None = Field(
        default=None,
        validation_alias=AliasChoices("translated_text", "translatedText"),
        description="English translation (None if already English or empty).",
    )
    language: str | None = Field(
        default=None,
        description="ISO 639-1 detected language code (e.g. 'en', 'hi', 'gu').",
    )
    word_count: int = Field(
        default=0,
        validation_alias=AliasChoices("word_count", "wordCount"),
    )
    char_count: int = Field(
        default=0,
        validation_alias=AliasChoices("char_count", "charCount"),
    )
    ocr_job_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("ocr_job_id", "ocrJobId"),
        description="Job ID of the OCRWorker run (only set for scanned pages).",
    )


class PDFWorkerOutput(BaseModel):
    """
    Immutable PDF evidence record produced by PDFWorker (M8).
    Consumed by Intelligence Fusion (M9) and Dashboard APIs (M13).
    """
    model_config = ConfigDict(populate_by_name=True)

    pdf_job_id: str = Field(
        validation_alias=AliasChoices("pdf_job_id", "pdfJobId"),
    )
    evidence_id: str = Field(
        validation_alias=AliasChoices("evidence_id", "evidenceId"),
    )
    pdf_file_name: str = Field(
        validation_alias=AliasChoices("pdf_file_name", "pdfFileName"),
    )
    pdf_metadata: PDFMetadata = Field(
        validation_alias=AliasChoices("pdf_metadata", "pdfMetadata"),
    )
    pages: list[PDFPageResult] = Field(
        default_factory=list,
        description="Per-page results (one entry per PDF page).",
    )
    merged_text: str = Field(
        default="",
        validation_alias=AliasChoices("merged_text", "mergedText"),
        description="All page English texts joined with double newlines.",
    )
    text_intelligence_job_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("text_intelligence_job_id", "textIntelligenceJobId"),
        description="Job ID of the TextIntelligence job queued with merged_text.",
    )
    status: str = Field(
        description="'complete' (all pages succeeded) or 'partial' (some pages failed).",
    )
    processing_duration_ms: float = Field(
        default=0.0,
        validation_alias=AliasChoices("processing_duration_ms", "processingDurationMs"),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        validation_alias=AliasChoices("created_at", "createdAt"),
    )
