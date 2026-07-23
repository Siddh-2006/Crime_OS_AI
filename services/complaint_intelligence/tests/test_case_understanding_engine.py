"""
Unit tests for CaseUnderstandingEngine execution, parsing, and retry.
"""
import json
import pytest
from app.case_understanding.engine import CaseUnderstandingEngine, _clean_json_response
from app.case_understanding.prompt_templates import CASE_UNDERSTANDING_SYSTEM_PROMPT
from app.core.exceptions import LLMError
from app.llm.client import ILLMClient
from app.schemas.case_context import CaseContext, EvidenceItem


class DummyLLMClient(ILLMClient):
    def __init__(self, responses: list[str]):
        self.responses = responses
        self.call_count = 0

    async def generate(self, prompt: str, system_prompt: str | None = None) -> str:
        res = self.responses[self.call_count]
        self.call_count += 1
        return res


def get_sample_valid_json() -> str:
    return json.dumps({
        "overview": {
            "complaint_summary": "Cyber fraud complaint",
            "incident_overview": "Victim cheated online",
            "crime_category": "Financial Cybercrime",
            "crime_subtype": "UPI Fraud",
            "priority": "high",
            "confidence": 0.9,
        },
        "timeline": [],
        "people_and_entities": {
            "victims": [{"value": "John Doe", "source_evidence_ids": [], "confidence": 0.9}],
            "suspects": [],
        },
        "evidence_analysis": [],
        "evidence_correlation": [],
        "crime_analysis": {
            "crime_category": "Financial Cybercrime",
            "crime_subtype": "UPI Fraud",
            "modus_operandi": "Phishing link sent via SMS",
        },
        "contradictions": [],
        "missing_information": [],
        "missing_evidence": [],
    })


def test_clean_json_response():
    raw_with_markdown = "```json\n{\"test\": 123}\n```"
    assert _clean_json_response(raw_with_markdown) == "{\"test\": 123}"


@pytest.mark.asyncio
async def test_engine_successful_single_pass():
    valid_json = get_sample_valid_json()
    client = DummyLLMClient([valid_json])
    engine = CaseUnderstandingEngine(llm_client=client, max_retries=2)

    context = CaseContext(complaint_text="Money was stolen online.")
    result = await engine.analyze(context)

    assert result.case_id == context.case_id
    assert result.overview.crime_category == "Financial Cybercrime"
    assert len(result.people_and_entities.victims) == 1
    assert result.people_and_entities.victims[0].value == "John Doe"
    assert client.call_count == 1


@pytest.mark.asyncio
async def test_engine_retry_on_invalid_json():
    invalid_json = "invalid json text"
    valid_json = get_sample_valid_json()
    client = DummyLLMClient([invalid_json, valid_json])
    engine = CaseUnderstandingEngine(llm_client=client, max_retries=2)

    context = CaseContext(complaint_text="Money was stolen online.")
    result = await engine.analyze(context)

    assert result.overview.crime_subtype == "UPI Fraud"
    assert client.call_count == 2


@pytest.mark.asyncio
async def test_engine_max_retries_exceeded():
    invalid_json = "invalid json text"
    client = DummyLLMClient([invalid_json, invalid_json])
    engine = CaseUnderstandingEngine(llm_client=client, max_retries=2)

    context = CaseContext(complaint_text="Money was stolen online.")
    with pytest.raises(LLMError):
        await engine.analyze(context)


def test_system_prompt_negative_constraints():
    prompt = CASE_UNDERSTANDING_SYSTEM_PROMPT
    assert "MUST NEVER recommend investigation actions" in prompt
    assert "MUST NEVER recommend arrests" in prompt
    assert "MUST NEVER recommend legal action, IPC or BNS statutory sections" in prompt
