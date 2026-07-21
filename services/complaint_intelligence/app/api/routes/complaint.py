"""
Synchronous complaint profiling endpoint.
Calls the ComplaintProfileWorker directly on the HTTP request thread.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel

from app.api.deps import get_di_container
from app.core.container import Container
from app.core.exceptions import LLMError
from app.llm.worker import ComplaintProfileWorker
from app.schemas.complaint import ComplaintProfile

router = APIRouter(tags=["Complaint"])


class ProfileRequest(BaseModel):
    text: str


@router.post(
    "/profile-complaint",
    response_model=ComplaintProfile,
    status_code=status.HTTP_200_OK,
    summary="Profile a complaint synchronously",
    description="Analyze a raw complaint text, detect language, translate if necessary, "
                "and return a structured profile of the complaint.",
)
async def profile_complaint(
    body: ProfileRequest,
    container: Annotated[Container, Depends(get_di_container)],
) -> ComplaintProfile:
    # Run the profiling logic synchronously by invoking the worker
    worker = ComplaintProfileWorker(container.llm_client)
    result = await worker.run({"text": body.text}, job_id="sync-profile")

    if not result.succeeded:
        raise LLMError(f"Complaint profiling failed: {result.error}")

    # The result.output is a dict matching ComplaintProfile
    return ComplaintProfile.model_validate(result.output)
