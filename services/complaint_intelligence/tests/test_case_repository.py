"""
Unit tests for CaseUnderstanding Repository and API routes.
"""
import pytest
from fastapi.testclient import TestClient

from app.case_understanding.repository import InMemoryCaseRepository, MongoCaseRepository
from app.main import app
from app.schemas.case_understanding import CaseUnderstanding, CrimeAnalysis, Overview


def get_dummy_case_understanding(case_id: str = "case-777") -> CaseUnderstanding:
    return CaseUnderstanding(
        case_id=case_id,
        overview=Overview(
            complaint_summary="Summary text",
            incident_overview="Overview text",
            crime_category="Cybercrime",
            crime_subtype="Phishing",
            priority="high",
            confidence=0.9,
        ),
        crime_analysis=CrimeAnalysis(
            crime_category="Cybercrime",
            crime_subtype="Phishing",
            modus_operandi="Phishing site",
        ),
        original_complaint="I lost money to phishing",
    )


@pytest.mark.asyncio
async def test_in_memory_repository():
    repo = InMemoryCaseRepository()
    case = get_dummy_case_understanding("case-001")
    await repo.save(case)

    fetched = await repo.get_by_id("case-001")
    assert fetched is not None
    assert fetched.case_id == "case-001"
    assert fetched.overview.crime_category == "Cybercrime"

    not_found = await repo.get_by_id("non-existent")
    assert not_found is None


@pytest.mark.asyncio
async def test_mongo_repository_fallback():
    repo = MongoCaseRepository()
    case = get_dummy_case_understanding("case-002")
    saved_id = await repo.save(case)
    assert saved_id == "case-002"

    fetched = await repo.get_by_id("case-002")
    assert fetched is not None
    assert fetched.case_id == "case-002"


def test_get_case_api_section_routes():
    from app.core.container import get_container
    container = get_container()
    
    case = get_dummy_case_understanding("case-api-1")
    container.case_repository = InMemoryCaseRepository()
    
    client = TestClient(app)
    # Save dummy case into in-memory repo
    import asyncio
    asyncio.run(container.case_repository.save(case))

    # GET full case
    resp = client.get("/case-understanding/case-api-1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["case_id"] == "case-api-1"
    assert data["overview"]["crime_category"] == "Cybercrime"

    # GET section overview
    resp_ov = client.get("/case-understanding/case-api-1/overview")
    assert resp_ov.status_code == 200
    assert resp_ov.json()["crime_category"] == "Cybercrime"

    # GET section timeline
    resp_tl = client.get("/case-understanding/case-api-1/timeline")
    assert resp_tl.status_code == 200
    assert resp_tl.json() == []

    # GET non-existent case 404
    resp_404 = client.get("/case-understanding/non-existent-case")
    assert resp_404.status_code == 404
