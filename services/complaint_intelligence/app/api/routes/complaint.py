"""
Complaint intelligence endpoints.
Provides synchronous profiling and asynchronous full-pipeline trigger support.
"""
from __future__ import annotations

import asyncio
import os
import subprocess
import sys
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import get_di_container
from app.core.container import Container
from app.core.exceptions import LLMError
from app.core.logging import logger
from app.llm.worker import ComplaintProfileWorker
from app.schemas.complaint import ComplaintProfile

router = APIRouter(tags=["Complaint"])


class ProfileRequest(BaseModel):
    text: str


class TriggerFullPipelineRequest(BaseModel):
    complaint_number: str


async def _stream_pipeline_output(process: subprocess.Popen[str], complaint_number: str) -> None:
    if process.stdout is None:
        logger.warning(
            "Complaint intelligence pipeline started without an output stream",
            extra={"complaint_number": complaint_number},
        )
        return

    try:
        while True:
            line = await asyncio.to_thread(process.stdout.readline)
            if not line:
                break
            message = line.rstrip()
            if message:
                logger.info(
                    "Complaint intelligence pipeline output",
                    extra={"complaint_number": complaint_number, "stdout": message},
                )
    finally:
        return_code = process.wait()
        logger.info(
            "Complaint intelligence pipeline process exited",
            extra={"complaint_number": complaint_number, "return_code": return_code},
        )


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
    result = await worker.run(payload={"text": body.text}, job_id="sync-profile")

    if not result.succeeded:
        raise LLMError(f"Complaint profiling failed: {result.error}")

    # The result.output is a dict matching ComplaintProfile
    return ComplaintProfile.model_validate(result.output)


@router.post(
    "/trigger-full-pipeline",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger the full complaint intelligence pipeline asynchronously",
    description="Starts the complaint intelligence orchestration from the Python service and returns immediately.",
)
async def trigger_full_pipeline(body: TriggerFullPipelineRequest) -> dict[str, object]:
    complaint_number = body.complaint_number.strip()
    if not complaint_number:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="complaint_number is required")

    script_path = Path(__file__).resolve().parents[3] / "run_full_pipeline.py"
    if not script_path.exists():
        logger.error(
            "Complaint intelligence full-pipeline script not found",
            extra={"complaint_number": complaint_number, "script_path": str(script_path)},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Full pipeline script does not exist on disk",
        )

    logger.info(
        "Full complaint pipeline trigger received over HTTP",
        extra={"complaint_number": complaint_number, "script_path": str(script_path)},
    )

    process = subprocess.Popen(
        [sys.executable, str(script_path), complaint_number],
        cwd=str(script_path.parent),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        env={**os.environ, "PYTHONUTF8": "1"},
    )

    asyncio.create_task(_stream_pipeline_output(process, complaint_number))

    return {
        "accepted": True,
        "complaint_number": complaint_number,
        "status": "started",
        "message": "Full complaint intelligence pipeline launch accepted by complaint_intelligence service.",
    }
