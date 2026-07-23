"""
Unit test for CasePipelineOrchestrator evidence extraction & case understanding flow.
"""
import pytest
from app.case_understanding.engine import CaseUnderstandingEngine
from app.case_understanding.pipeline_orchestrator import CasePipelineOrchestrator
from app.case_understanding.repository import InMemoryCaseRepository
from app.core.container import get_container
from tests.test_case_understanding_engine import DummyLLMClient, get_sample_valid_json


@pytest.mark.asyncio
async def test_pipeline_orchestration_with_mock_files():
    container = get_container()
    
    # Mock LLM client & engine
    valid_json = get_sample_valid_json()
    llm_client = DummyLLMClient([valid_json])
    engine = CaseUnderstandingEngine(llm_client=llm_client)
    repo = InMemoryCaseRepository()

    orchestrator = CasePipelineOrchestrator(
        container=container,
        engine=engine,
        repository=repo,
    )

    complaint_text = "I was cheated online during a fake transaction."
    files = [
        ("bank_statement.pdf", "application/pdf", b"Transaction of 25000 rupees"),
        ("chat_log.txt", "text/plain", b"Pay to rajesh@ybl now"),
    ]

    case = await orchestrator.process_case(
        complaint_text=complaint_text,
        files=files,
        case_id="orchestrator-test-01",
    )

    assert case.case_id == "orchestrator-test-01"
    assert case.overview.crime_category == "Financial Cybercrime"
    
    # Verify persisted in repo
    saved_case = await repo.get_by_id("orchestrator-test-01")
    assert saved_case is not None
    assert saved_case.case_id == "orchestrator-test-01"
