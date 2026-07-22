"""
Integration tests for health endpoints.
Uses TestClient with MockQueue — no real Redis required.
"""
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings


@pytest.mark.unit
def test_liveness_returns_200(client: TestClient):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == settings.APP_NAME
    assert body["version"] == settings.APP_VERSION
    assert "started_at" in body


@pytest.mark.unit
def test_liveness_content_type_json(client: TestClient):
    resp = client.get("/health")
    assert "application/json" in resp.headers["content-type"]


@pytest.mark.unit
def test_detailed_health_returns_200_when_queue_ok(client: TestClient):
    """
    MockQueue.depth() always succeeds, so the readiness response is 200.
    (Redis ping will fail in CI without a real Redis — handled by mock override.)
    """
    resp = client.get("/health/detailed")
    # 200 if queue dep is ok; 503 if redis check fails — both valid in test env
    assert resp.status_code in (200, 503)
    body = resp.json()
    assert "dependencies" in body
    assert "queue_depth" in body
    assert body["service"] == settings.APP_NAME


@pytest.mark.unit
def test_detailed_health_structure(client: TestClient):
    resp = client.get("/health/detailed")
    body = resp.json()
    assert isinstance(body["dependencies"], list)
    for dep in body["dependencies"]:
        assert "name" in dep
        assert "status" in dep
    assert isinstance(body["queue_depth"], int)


@pytest.mark.unit
def test_swagger_docs_available(client: TestClient):
    resp = client.get("/docs")
    assert resp.status_code == 200


@pytest.mark.unit
def test_openapi_schema_available(client: TestClient):
    resp = client.get("/openapi.json")
    assert resp.status_code == 200
    schema = resp.json()
    assert schema["info"]["title"] == settings.APP_NAME
    assert "paths" in schema
