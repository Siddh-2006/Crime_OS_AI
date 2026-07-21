"""
MockQueue — in-memory IQueue implementation for unit tests.
No Redis dependency. Deterministic. Thread-safe via asyncio (single event loop).
"""
from __future__ import annotations

from collections import defaultdict, deque
from typing import Optional

from app.queue.interface import IQueue
from app.queue.job import Job, JobStatus


class MockQueue(IQueue):
    def __init__(self) -> None:
        self._queues: dict[str, deque[Job]] = defaultdict(deque)
        self._statuses: dict[str, JobStatus] = {}
        self._dead: dict[str, list[Job]] = defaultdict(list)
        self._processing: dict[str, Job] = {}
        self._results: dict[str, dict] = {}

    async def enqueue(self, job: Job) -> str:
        self._queues[job.job_type.value].appendleft(job)
        self._statuses[job.job_id] = JobStatus.QUEUED
        return job.job_id

    async def dequeue(self, job_type: str | None = None) -> Optional[Job]:
        if job_type:
            q = self._queues.get(job_type)
            if not q:
                return None
            job = q.pop()
        else:
            # Pop from first non-empty queue
            for q in self._queues.values():
                if q:
                    job = q.pop()
                    break
            else:
                return None
        self._processing[job.job_id] = job
        self._statuses[job.job_id] = JobStatus.RUNNING
        return job

    async def ack(self, job_id: str) -> None:
        self._processing.pop(job_id, None)
        self._statuses[job_id] = JobStatus.COMPLETED

    async def nack(self, job: Job) -> None:
        self._processing.pop(job.job_id, None)
        if job.can_retry:
            next_job = job.next_attempt()
            await self.enqueue(next_job)
            self._statuses[job.job_id] = JobStatus.FAILED
        else:
            self._dead[job.job_type.value].append(job)
            self._statuses[job.job_id] = JobStatus.DEAD

    async def get_status(self, job_id: str) -> Optional[JobStatus]:
        return self._statuses.get(job_id)

    async def depth(self, job_type: str | None = None) -> int:
        if job_type:
            return len(self._queues.get(job_type, deque()))
        return sum(len(q) for q in self._queues.values())

    async def set_result(self, job_id: str, result: dict) -> None:
        self._results[job_id] = result

    async def get_result(self, job_id: str) -> Optional[dict]:
        return self._results.get(job_id)

    # ── Test helpers ──────────────────────────────────────────────────────────

    def all_jobs(self, job_type: str | None = None) -> list[Job]:
        if job_type:
            return list(self._queues.get(job_type, deque()))
        return [j for q in self._queues.values() for j in q]

    def dead_jobs(self, job_type: str | None = None) -> list[Job]:
        if job_type:
            return self._dead.get(job_type, [])
        return [j for jobs in self._dead.values() for j in jobs]

    def clear(self) -> None:
        self._queues.clear()
        self._statuses.clear()
        self._dead.clear()
        self._processing.clear()
        self._results.clear()
