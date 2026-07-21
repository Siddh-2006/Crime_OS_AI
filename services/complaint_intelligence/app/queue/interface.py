"""
IQueue — interface every queue implementation must satisfy.
Production uses RedisQueue; tests use MockQueue.
Business logic depends ONLY on this interface.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional

from app.queue.job import Job, JobStatus


class IQueue(ABC):
    """Abstract queue contract."""

    @abstractmethod
    async def enqueue(self, job: Job) -> str:
        """Push job onto the queue. Returns job_id."""
        ...

    @abstractmethod
    async def dequeue(self, job_type: str | None = None) -> Optional[Job]:
        """Pop the next available job. Returns None if queue is empty."""
        ...

    @abstractmethod
    async def ack(self, job_id: str) -> None:
        """Mark a job as completed successfully."""
        ...

    @abstractmethod
    async def nack(self, job: Job) -> None:
        """
        Mark a job as failed.
        If job.can_retry, re-enqueue with incremented attempt.
        Otherwise mark as DEAD.
        """
        ...

    @abstractmethod
    async def get_status(self, job_id: str) -> Optional[JobStatus]:
        """Return current status of a job, or None if unknown."""
        ...

    @abstractmethod
    async def depth(self, job_type: str | None = None) -> int:
        """Return number of queued (pending) jobs."""
        ...

    @abstractmethod
    async def set_result(self, job_id: str, result: dict) -> None:
        """Store the JSON-serializable result of a completed job."""
        ...

    @abstractmethod
    async def get_result(self, job_id: str) -> Optional[dict]:
        """Retrieve the result of a completed job, or None if not found/completed."""
        ...
