"""
Job management endpoints — enqueue, status.
Milestone 1 only exposes the plumbing; actual job types are wired in M2+.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel

from app.api.deps import get_queue
from app.queue.interface import IQueue
from app.queue.job import Job, JobStatus, JobType

router = APIRouter(prefix="/jobs", tags=["Jobs"])


class EnqueueRequest(BaseModel):
    job_type: JobType
    payload: dict
    correlation_id: str | None = None


class EnqueueResponse(BaseModel):
    job_id: str
    job_type: str
    status: str = "queued"


class JobStatusResponse(BaseModel):
    job_id: str
    status: str | None
    result: dict | None = None


@router.post(
    "",
    response_model=EnqueueResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Enqueue a job",
    description="Push a job onto the appropriate worker queue. "
                "Returns immediately — processing is asynchronous.",
)
async def enqueue_job(
    body: EnqueueRequest,
    queue: Annotated[IQueue, Depends(get_queue)],
) -> EnqueueResponse:
    job = Job(
        job_type=body.job_type,
        payload=body.payload,
        correlation_id=body.correlation_id,
    )
    await queue.enqueue(job)
    return EnqueueResponse(job_id=job.job_id, job_type=job.job_type.value)


@router.get(
    "/{job_id}/status",
    response_model=JobStatusResponse,
    summary="Get job status",
    description="Returns the current status of a job by ID. "
                "Statuses are retained for 24 hours after completion.",
)
async def get_job_status(
    job_id: str,
    queue: Annotated[IQueue, Depends(get_queue)],
) -> JobStatusResponse:
    job_status: JobStatus | None = await queue.get_status(job_id)
    result = None
    if job_status == JobStatus.COMPLETED:
        result = await queue.get_result(job_id)
    return JobStatusResponse(
        job_id=job_id,
        status=job_status.value if job_status else None,
        result=result,
    )
