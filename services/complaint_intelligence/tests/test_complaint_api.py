"""
Integration tests for the complaint profiling API routes and AnalysisWorker.
"""
from __future__ import annotations

import json
import pytest
from fastapi.testclient import TestClient

from app.core.container import get_container
from app.llm.client import MockLLMClient
from app.queue.job import JobStatus, JobType
from app.queue.mock_queue import MockQueue
from app.queue.worker_runner import AnalysisWorker


@pytest.mark.unit
def test_sync_profile_complaint_route(client: TestClient, mock_llm_client: MockLLMClient):
    profile_data = {
        "crime_type": "cyber_financial_fraud",
        "priority": "high",
        "summary": "Victim lost Rs 48000.",
        "missing_information": ["UPI ID of receiver"],
        "recommendations": ["Trace bank account"],
        "confidence": 0.95,
    }
    mock_llm_client.set_response(prompt_keyword="Analyze the following complaint text", response=json.dumps(profile_data))

    resp = client.post("/profile-complaint", json={"text": "I lost money online via fake link."})
    assert resp.status_code == 200
    body = resp.json()
    assert body["crime_type"] == "cyber_financial_fraud"
    assert body["priority"] == "high"
    assert body["confidence"] == 0.95


@pytest.mark.unit
def test_sync_profile_complaint_route_failure(client: TestClient, mock_llm_client: MockLLMClient):
    mock_llm_client.default_response = "invalid json"
    resp = client.post("/profile-complaint", json={"text": "I lost money."})
    assert resp.status_code == 502
    assert resp.json()["success"] is False
    assert resp.json()["error"]["code"] == "LLM_ERROR"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_analysis_worker_loop_and_async_retrieval(
    client: TestClient, mock_queue: MockQueue, mock_llm_client: MockLLMClient
):
    profile_data = {
        "crime_type": "cyber_financial_fraud",
        "priority": "high",
        "summary": "Victim lost Rs 48000.",
        "missing_information": [],
        "recommendations": [],
        "confidence": 0.95,
    }
    mock_llm_client.set_response(prompt_keyword="Analyze the following complaint text", response=json.dumps(profile_data))

    # 1. Enqueue job via API
    resp = client.post(
        "/jobs",
        json={
            "job_type": JobType.COMPLAINT_PROFILE.value,
            "payload": {"text": "I lost money online via fake link."},
        },
    )
    assert resp.status_code == 202
    job_id = resp.json()["job_id"]

    # Verify status is queued
    status_resp = client.get(f"/jobs/{job_id}/status")
    assert status_resp.status_code == 200
    assert status_resp.json()["status"] == JobStatus.QUEUED.value
    assert status_resp.json()["result"] is None

    # 2. Run AnalysisWorker loop manually for one iteration
    container = get_container()
    job = await mock_queue.dequeue(JobType.COMPLAINT_PROFILE.value)
    assert job is not None
    assert job.job_id == job_id

    # Run the worker inside the loop logic
    from app.llm.worker import ComplaintProfileWorker

    worker = ComplaintProfileWorker(container.llm_client)
    result = await worker.run(payload=job.payload, attempt=job.attempt, job_id=job.job_id)

    assert result.succeeded is True
    await mock_queue.set_result(job.job_id, result.output)
    await mock_queue.ack(job.job_id)

    # 3. Check status again via API
    status_resp = client.get(f"/jobs/{job_id}/status")
    assert status_resp.status_code == 200
    body = status_resp.json()
    assert body["status"] == JobStatus.COMPLETED.value
    assert body["result"]["crime_type"] == "cyber_financial_fraud"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_analysis_worker_start_stop():
    mock_llm = MockLLMClient()
    mock_q = MockQueue()
    container = get_container()
    container.llm_client = mock_llm

    runner = AnalysisWorker(mock_q, container, poll_interval=0.001)
    runner.start()
    assert runner._running is True
    await runner.stop()
    assert runner._running is False
