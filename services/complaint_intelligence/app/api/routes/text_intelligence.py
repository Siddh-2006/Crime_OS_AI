"""
Synchronous text intelligence endpoint.
Runs the full NER + Regex + Event extraction pipeline on request.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field

from app.api.deps import get_di_container
from app.core.container import Container
from app.schemas.text_intelligence import TextIntelligenceResult
from app.text_intelligence.worker import TextIntelligenceWorker

router = APIRouter(tags=["Text Intelligence"])


class AnalyzeTextRequest(BaseModel):
    text: str = Field(
        ..., min_length=1,
        description="English text to analyse (complaint, OCR, audio transcript, or PDF text).",
    )
    source_type: str = Field(
        default="complaint",
        description="Origin of the text: complaint, ocr, audio, or pdf.",
    )


@router.post(
    "/analyze-text",
    response_model=TextIntelligenceResult,
    status_code=status.HTTP_200_OK,
    summary="Run text intelligence pipeline",
    description=(
        "Extract named entities, regex-based entities, and structured events "
        "from English text. Returns a TextIntelligenceResult."
    ),
)
async def analyze_text(
    body: AnalyzeTextRequest,
    container: Annotated[Container, Depends(get_di_container)],
) -> TextIntelligenceResult:
    worker = TextIntelligenceWorker(
        ner_extractor=container.ner_extractor,
        regex_extractor=container.regex_extractor,
        event_extractor=container.event_extractor,
        entity_linker=container.entity_linker,
    )
    result = await worker.run(
        {"text": body.text, "source_type": body.source_type},
        job_id="sync-text-intel",
    )

    if not result.succeeded:
        from app.core.exceptions import WorkerError
        raise WorkerError(f"Text intelligence pipeline failed: {result.error}")

    return TextIntelligenceResult.model_validate(result.output)
