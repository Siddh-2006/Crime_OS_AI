"""
Integration tests for job queue endpoints.
"""
import pytest
from fastapi.testclient import TestClient

from app.queue.job import JobStatus, JobType
from app.queue.mock_queue import MockQueue


@pytest.mark.unit
def test_enqueue_job_returns_202(client: TestClient):
    resp = client.post("/jobs", json={
        "job_type": JobType.COMPLAINT_PROFILE.value,
        "payload": {"complaint_id": "test-123"},
    })
    assert resp.status_code == 202
    body = resp.json()
    assert "job_id" in body
    assert body["job_type"] == JobType.COMPLAINT_PROFILE.value
    assert body["status"] == "queued"


@pytest.mark.unit
def test_enqueue_job_with_correlation_id(client: TestClient):
    resp = client.post("/jobs", json={
        "job_type": JobType.OCR_WORKER.value,
        "payload": {"file": "evidence.jpg"},
        "correlation_id": "complaint-abc",
    })
    assert resp.status_code == 202


@pytest.mark.unit
def test_enqueue_invalid_job_type_returns_422(client: TestClient):
    resp = client.post("/jobs", json={
        "job_type": "not_a_real_type",
        "payload": {},
    })
    assert resp.status_code == 422


@pytest.mark.unit
def test_enqueue_missing_payload_returns_422(client: TestClient):
    resp = client.post("/jobs", json={"job_type": JobType.COMPLAINT_PROFILE.value})
    assert resp.status_code == 422


@pytest.mark.unit
def test_get_job_status_after_enqueue(client: TestClient, mock_queue: MockQueue):
    # Enqueue via API
    resp = client.post("/jobs", json={
        "job_type": JobType.COMPLAINT_PROFILE.value,
        "payload": {"x": 1},
    })
    job_id = resp.json()["job_id"]

    # Check status
    status_resp = client.get(f"/jobs/{job_id}/status")
    assert status_resp.status_code == 200
    body = status_resp.json()
    assert body["job_id"] == job_id
    assert body["status"] == JobStatus.QUEUED.value


@pytest.mark.unit
def test_get_status_unknown_job_returns_null(client: TestClient):
    resp = client.get("/jobs/does-not-exist/status")
    assert resp.status_code == 200
    assert resp.json()["status"] is None


@pytest.mark.unit
def test_enqueued_job_appears_in_mock_queue(client: TestClient, mock_queue: MockQueue):
    client.post("/jobs", json={
        "job_type": JobType.AUDIO_WORKER.value,
        "payload": {"audio_url": "https://example.com/audio.mp3"},
    })
    jobs = mock_queue.all_jobs(JobType.AUDIO_WORKER.value)
    assert len(jobs) == 1
    assert jobs[0].payload["audio_url"] == "https://example.com/audio.mp3"
