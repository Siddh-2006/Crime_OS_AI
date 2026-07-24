"""Complaint Profile schema for synchronous complaint analysis.

This schema accepts both the detailed, deterministic profiling fields used by
internal workers (`original_text`, `text_length`, etc.) and the LLM-produced
fields (`crime_type`, `priority`, `confidence`, `summary`, `missing_information`,
`recommendations`). This makes the schema resilient when the pipeline builds a
`ComplaintProfile` from either source.
"""
from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field


class ComplaintProfile(BaseModel):
    """Structured profile of a complaint after analysis.

    Fields are backwards-compatible: deterministic extractors may populate the
    left-side fields while the LLM worker populates the right-side fields.
    """

    # Deterministic/local extractor fields (optional)
    original_text: str | None = Field(default=None, description="Original complaint text provided")
    language: str = Field(default="en", description="Detected language code (e.g., 'en', 'hi')")
    text_length: int | None = Field(default=None, description="Length of the complaint text in characters")
    word_count: int | None = Field(default=None, description="Number of words in the complaint")
    key_entities: List[str] = Field(default_factory=list, description="Extracted entities (people, places, etc.)")
    severity_score: float | None = Field(default=None, ge=0.0, le=1.0, description="Severity score from 0.0 to 1.0")
    case_type: str | None = Field(default=None, description="Detected case type or category")

    # LLM-produced fields (also optional)
    crime_type: str = Field(default="unknown", description="LLM-derived crime type/category")
    priority: str = Field(default="medium", description="LLM-derived priority: low|medium|high|critical")
    confidence: float = Field(default=0.0, description="LLM confidence (0.0 - 1.0)")
    summary: str = Field(default="", description="LLM short summary of the complaint")
    missing_information: List[str] = Field(default_factory=list, description="Missing information items identified by LLM")
    recommendations: List[str] = Field(default_factory=list, description="LLM-generated recommendations or hints")
