"""
Typed job definitions for all queue workers.
Every job carries: job_id, job_type, payload, and retry metadata.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class JobType(str, Enum):
    IMAGE_WORKER = "image_worker"
    OCR_WORKER = "ocr_worker"
    AUDIO_WORKER = "audio_worker"
    VIDEO_WORKER = "video_worker"
    PDF_WORKER = "pdf_worker"
    CASE_UNDERSTANDING = "case_understanding"
    COMPLAINT_PROFILE = "complaint_profile"
    TEXT_INTELLIGENCE = "text_intelligence"
    # Secure Evidence Upload System
    EVIDENCE_UPLOADED = "evidence_uploaded"  # Dispatched by upload endpoint; runs worker + LLM fusion


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    DEAD = "dead"            # exhausted all retries


class Job(BaseModel):
    job_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_type: JobType
    payload: dict[str, Any]
    attempt: int = 1
    max_attempts: int = 3
    enqueued_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    correlation_id: str | None = None   # links jobs for the same complaint

    @property
    def can_retry(self) -> bool:
        return self.attempt < self.max_attempts

    def next_attempt(self) -> "Job":
        return self.model_copy(update={"attempt": self.attempt + 1})
