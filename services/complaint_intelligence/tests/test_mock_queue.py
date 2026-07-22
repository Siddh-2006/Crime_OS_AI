"""
Unit tests for MockQueue — verifies queue contract without Redis.
"""
import pytest
from app.queue.mock_queue import MockQueue
from app.queue.job import Job, JobStatus, JobType


def _job(jtype: JobType = JobType.COMPLAINT_PROFILE, payload: dict | None = None) -> Job:
    return Job(job_type=jtype, payload=payload or {"test": True})


@pytest.mark.unit
@pytest.mark.asyncio
async def test_enqueue_sets_queued_status():
    q = MockQueue()
    job = _job()
    job_id = await q.enqueue(job)
    assert job_id == job.job_id
    assert await q.get_status(job_id) == JobStatus.QUEUED


@pytest.mark.unit
@pytest.mark.asyncio
async def test_depth_increases_on_enqueue():
    q = MockQueue()
    assert await q.depth() == 0
    await q.enqueue(_job())
    assert await q.depth() == 1
    await q.enqueue(_job())
    assert await q.depth() == 2


@pytest.mark.unit
@pytest.mark.asyncio
async def test_dequeue_returns_job_and_sets_running():
    q = MockQueue()
    job = _job()
    await q.enqueue(job)
    dequeued = await q.dequeue(job.job_type.value)
    assert dequeued is not None
    assert dequeued.job_id == job.job_id
    assert await q.get_status(job.job_id) == JobStatus.RUNNING


@pytest.mark.unit
@pytest.mark.asyncio
async def test_dequeue_empty_returns_none():
    q = MockQueue()
    result = await q.dequeue(JobType.COMPLAINT_PROFILE.value)
    assert result is None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_ack_sets_completed():
    q = MockQueue()
    job = _job()
    await q.enqueue(job)
    await q.dequeue(job.job_type.value)
    await q.ack(job.job_id)
    assert await q.get_status(job.job_id) == JobStatus.COMPLETED
    assert await q.depth() == 0


@pytest.mark.unit
@pytest.mark.asyncio
async def test_nack_retries_when_attempts_remain():
    q = MockQueue()
    job = _job()
    assert job.can_retry is True   # attempt=1, max=3

    await q.enqueue(job)
    dequeued = await q.dequeue(job.job_type.value)
    await q.nack(dequeued)

    # Original job marked failed; re-queued job has attempt=2
    assert await q.get_status(job.job_id) == JobStatus.FAILED
    assert await q.depth() == 1
    requeued = await q.dequeue(job.job_type.value)
    assert requeued.attempt == 2


@pytest.mark.unit
@pytest.mark.asyncio
async def test_nack_dead_letters_after_max_attempts():
    q = MockQueue()
    job = Job(job_type=JobType.COMPLAINT_PROFILE, payload={}, attempt=3, max_attempts=3)
    assert job.can_retry is False

    await q.enqueue(job)
    dequeued = await q.dequeue(job.job_type.value)
    await q.nack(dequeued)

    assert await q.get_status(job.job_id) == JobStatus.DEAD
    assert await q.depth() == 0
    dead = q.dead_jobs(JobType.COMPLAINT_PROFILE.value)
    assert len(dead) == 1
    assert dead[0].job_id == job.job_id


@pytest.mark.unit
@pytest.mark.asyncio
async def test_depth_by_job_type():
    q = MockQueue()
    await q.enqueue(_job(JobType.COMPLAINT_PROFILE))
    await q.enqueue(_job(JobType.COMPLAINT_PROFILE))
    await q.enqueue(_job(JobType.OCR_WORKER))

    assert await q.depth(JobType.COMPLAINT_PROFILE.value) == 2
    assert await q.depth(JobType.OCR_WORKER.value) == 1
    assert await q.depth() == 3


@pytest.mark.unit
@pytest.mark.asyncio
async def test_clear_resets_queue():
    q = MockQueue()
    await q.enqueue(_job())
    q.clear()
    assert await q.depth() == 0
