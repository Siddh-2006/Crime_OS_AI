"""
Unit tests for BaseWorker contract.
"""
import pytest
from app.base.worker import BaseWorker, WorkerStatus


class _OkWorker(BaseWorker[str, str]):
    worker_name = "ok_worker"

    async def process(self, *, job_id: str, payload: str, attempt: int) -> str:
        return f"processed:{payload}"


class _FailWorker(BaseWorker[str, str]):
    worker_name = "fail_worker"

    async def process(self, *, job_id: str, payload: str, attempt: int) -> str:
        raise ValueError("deliberate failure")


class _SlowWorker(BaseWorker[str, str]):
    worker_name = "slow_worker"

    async def process(self, *, job_id: str, payload: str, attempt: int) -> str:
        import asyncio
        await asyncio.sleep(0.01)
        return "done"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_successful_worker_returns_completed():
    worker = _OkWorker()
    result = await worker.run("hello")
    assert result.succeeded is True
    assert result.status == WorkerStatus.COMPLETED
    assert result.output == "processed:hello"
    assert result.error is None
    assert result.duration_ms > 0


@pytest.mark.unit
@pytest.mark.asyncio
async def test_failing_worker_returns_failed():
    worker = _FailWorker()
    result = await worker.run("hello")
    assert result.succeeded is False
    assert result.status == WorkerStatus.FAILED
    assert result.output is None
    assert "deliberate failure" in result.error


@pytest.mark.unit
@pytest.mark.asyncio
async def test_job_id_propagated():
    worker = _OkWorker()
    result = await worker.run("data", job_id="fixed-id")
    assert result.job_id == "fixed-id"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_auto_job_id_generated():
    worker = _OkWorker()
    result = await worker.run("data")
    assert len(result.job_id) == 36   # UUID4 string


@pytest.mark.unit
@pytest.mark.asyncio
async def test_attempt_tracked():
    worker = _OkWorker()
    result = await worker.run("data", attempt=2)
    assert result.attempt == 2


@pytest.mark.unit
@pytest.mark.asyncio
async def test_duration_tracked():
    worker = _SlowWorker()
    result = await worker.run("data")
    assert result.duration_ms >= 10   # at least 10 ms sleep


@pytest.mark.unit
def test_result_to_dict():
    from app.base.worker import WorkerResult
    r = WorkerResult(job_id="abc", status=WorkerStatus.COMPLETED, output="x", duration_ms=42.5)
    d = r.to_dict()
    assert d["job_id"] == "abc"
    assert d["status"] == "completed"
    assert d["duration_ms"] == 42.5
