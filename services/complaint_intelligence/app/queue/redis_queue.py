"""
RedisQueue — production IQueue implementation backed by Redis lists.

Data layout (all keys prefixed with 'coi:'):
  coi:queue:{job_type}          — LPUSH / BRPOP  (FIFO list of JSON job blobs)
  coi:processing:{job_id}       — STRING  (JSON job blob, TTL = job_timeout)
  coi:status:{job_id}           — STRING  (JobStatus value, TTL = 24 h)
  coi:dead:{job_type}           — LIST    (dead-letter store)
"""
from __future__ import annotations

import json
from typing import Optional

import redis.asyncio as aioredis

from app.core.config import settings
from app.core.logging import logger
from app.queue.interface import IQueue
from app.queue.job import Job, JobStatus

_PREFIX = "coi"
_STATUS_TTL = 86_400        # 24 h
_PROCESSING_TTL = settings.QUEUE_JOB_TIMEOUT


def _q_key(job_type: str) -> str:
    return f"{_PREFIX}:queue:{job_type}"


def _proc_key(job_id: str) -> str:
    return f"{_PREFIX}:processing:{job_id}"


def _status_key(job_id: str) -> str:
    return f"{_PREFIX}:status:{job_id}"


def _dead_key(job_type: str) -> str:
    return f"{_PREFIX}:dead:{job_type}"


class RedisQueue(IQueue):
    def __init__(self, client: aioredis.Redis) -> None:
        self._r = client

    async def enqueue(self, job: Job) -> str:
        blob = job.model_dump_json()
        await self._r.lpush(_q_key(job.job_type.value), blob)
        await self._r.set(_status_key(job.job_id), JobStatus.QUEUED.value, ex=_STATUS_TTL)
        logger.debug(
            "Job enqueued",
            extra={"job_id": job.job_id, "job_type": job.job_type.value, "attempt": job.attempt},
        )
        return job.job_id

    async def dequeue(self, job_type: str | None = None) -> Optional[Job]:
        key = _q_key(job_type) if job_type else f"{_PREFIX}:queue:*"
        # Non-blocking pop
        result = await self._r.rpop(key)
        if result is None:
            return None
        job = Job.model_validate_json(result)
        # Move to processing set
        await self._r.set(_proc_key(job.job_id), result, ex=_PROCESSING_TTL)
        await self._r.set(_status_key(job.job_id), JobStatus.RUNNING.value, ex=_STATUS_TTL)
        logger.debug(
            "Job dequeued",
            extra={"job_id": job.job_id, "job_type": job.job_type.value},
        )
        return job

    async def ack(self, job_id: str) -> None:
        await self._r.delete(_proc_key(job_id))
        await self._r.set(_status_key(job_id), JobStatus.COMPLETED.value, ex=_STATUS_TTL)
        logger.debug("Job acked", extra={"job_id": job_id})

    async def nack(self, job: Job) -> None:
        await self._r.delete(_proc_key(job.job_id))
        if job.can_retry:
            next_job = job.next_attempt()
            await self.enqueue(next_job)
            await self._r.set(
                _status_key(job.job_id), JobStatus.FAILED.value, ex=_STATUS_TTL
            )
            logger.warning(
                "Job nacked — retrying",
                extra={"job_id": job.job_id, "next_attempt": next_job.attempt},
            )
        else:
            blob = job.model_dump_json()
            await self._r.lpush(_dead_key(job.job_type.value), blob)
            await self._r.set(
                _status_key(job.job_id), JobStatus.DEAD.value, ex=_STATUS_TTL
            )
            logger.error(
                "Job dead-lettered — all retries exhausted",
                extra={"job_id": job.job_id, "job_type": job.job_type.value},
            )

    async def get_status(self, job_id: str) -> Optional[JobStatus]:
        raw = await self._r.get(_status_key(job_id))
        return JobStatus(raw) if raw else None

    async def depth(self, job_type: str | None = None) -> int:
        if job_type:
            return await self._r.llen(_q_key(job_type))
        # Sum across all known queue keys
        keys = await self._r.keys(f"{_PREFIX}:queue:*")
        if not keys:
            return 0
        lengths = await self._r.mget(*keys)   # type: ignore[arg-type]
        return sum(int(v or 0) for v in lengths)

    async def set_result(self, job_id: str, result: dict) -> None:
        blob = json.dumps(result)
        await self._r.set(f"{_PREFIX}:result:{job_id}", blob, ex=_STATUS_TTL)

    async def get_result(self, job_id: str) -> Optional[dict]:
        raw = await self._r.get(f"{_PREFIX}:result:{job_id}")
        return json.loads(raw) if raw else None
