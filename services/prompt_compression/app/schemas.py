"""
Pydantic schemas for the Prompt Compression Service.
"""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class CompressRequest(BaseModel):
    text: str = Field(..., description="The content to compress.")
    target_token_count: Optional[int] = Field(
        default=None,
        description="Hard target token count. If given, 'rate' is ignored.",
    )
    rate: float = Field(
        default=0.5,
        ge=0.01,
        le=0.99,
        description="Compression rate when target_token_count is not set (0.5 = keep 50%).",
    )
    force_tokens: List[str] = Field(
        default_factory=list,
        description="Tokens/phrases that must NEVER be dropped (e.g. IDs, dates, section codes).",
    )


class CompressResponse(BaseModel):
    compressed_text: str
    original_tokens: int
    compressed_tokens: int
    compression_ratio: float = Field(
        description="compressed_tokens / original_tokens. Lower = more compressed."
    )
