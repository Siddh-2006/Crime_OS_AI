"""
BaseWorker — abstract contract every queue worker must implement.

Enforces:
- Structured logging on start / complete / failure
- Duration tracking
- Retry counting
- Progress reporting (via a typed ProgressUpdate)
- Error capture into a typed WorkerResult

Business logic belongs in subclass.process().
Infrastructure (Redis, queues, logging) belongs here.
"""
from __future__ import annotations

import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Generic, TypeVar

from app.core.logging import logger

InputT = TypeVar("InputT")
OutputT = TypeVar("OutputT")


class WorkerStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"


@dataclass
class ProgressUpdate:
    job_id: str
    step: str
    percent: float          # 0.0 – 1.0
    message: str = ""


@dataclass
class WorkerResult(Generic[OutputT]):
    job_id: str
    status: WorkerStatus
    output: OutputT | None = None
    error: str | None = None
    duration_ms: float = 0.0
    attempt: int = 1
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def succeeded(self) -> bool:
        return self.status == WorkerStatus.COMPLETED

    def to_dict(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "status": self.status.value,
            "output": self.output,
            "error": self.error,
            "duration_ms": round(self.duration_ms, 2),
            "attempt": self.attempt,
            "metadata": self.metadata,
        }


class BaseWorker(ABC, Generic[InputT, OutputT]):
    """
    Abstract base class for all workers.

    Subclasses implement:
        process(job_id, payload, attempt) -> OutputT

    The run() method wraps process() with:
        - timing
        - structured logging (start / progress / complete / failure)
        - exception capture into WorkerResult
    """

    worker_name: str = "base_worker"

    async def run(
        self,
        payload: InputT,
        *,
        attempt: int = 1,
        job_id: str | None = None,
    ) -> WorkerResult[OutputT]:
        job_id = job_id or str(uuid.uuid4())
        t_start = time.perf_counter()

        logger.info(
            f"[{self.worker_name}] Job started",
            extra={"job_id": job_id, "attempt": attempt, "worker": self.worker_name},
        )

        try:
            output = await self.process(job_id=job_id, payload=payload, attempt=attempt)
            duration_ms = (time.perf_counter() - t_start) * 1000

            result: WorkerResult[OutputT] = WorkerResult(
                job_id=job_id,
                status=WorkerStatus.COMPLETED,
                output=output,
                duration_ms=duration_ms,
                attempt=attempt,
            )
            logger.info(
                f"[{self.worker_name}] Job completed",
                extra={
                    "job_id": job_id,
                    "duration_ms": round(duration_ms, 2),
                    "attempt": attempt,
                    "worker": self.worker_name,
                },
            )
            return result

        except Exception as exc:
            duration_ms = (time.perf_counter() - t_start) * 1000
            logger.error(
                f"[{self.worker_name}] Job failed",
                extra={
                    "job_id": job_id,
                    "attempt": attempt,
                    "duration_ms": round(duration_ms, 2),
                    "error": str(exc),
                    "worker": self.worker_name,
                },
                exc_info=exc,
            )
            return WorkerResult(
                job_id=job_id,
                status=WorkerStatus.FAILED,
                error=str(exc),
                duration_ms=duration_ms,
                attempt=attempt,
            )

    def report_progress(self, update: ProgressUpdate) -> None:
        """Log a progress update. Subclasses can override to push to Redis/SSE."""
        logger.debug(
            f"[{self.worker_name}] Progress",
            extra={
                "job_id": update.job_id,
                "step": update.step,
                "percent": update.percent,
                "message": update.message,
                "worker": self.worker_name,
            },
        )

    @abstractmethod
    async def process(self, *, job_id: str, payload: InputT, attempt: int) -> OutputT:
        """
        Core business logic — implemented by each worker.
        Must raise an exception on unrecoverable failure.
        """
        ...
