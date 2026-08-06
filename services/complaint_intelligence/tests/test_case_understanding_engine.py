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
        "case_understanding": {
            "complaint_summary": "Cyber fraud complaint",
            "incident_overview": "Victim cheated online",
            "crime_category": "Financial Cybercrime",
            "crime_subtype": "UPI Fraud",
            "priority": "high",
            "confidence": 0.9,
        },
        "timeline": [
            {
                "timestamp": "2026-08-01 10:00:00",
                "description": "Initial call received from scammer",
                "supporting_evidence_ids": ["ev-1"],
                "confidence": 0.9,
            }
        ],
        "evidence_intelligence": [
            {
                "evidence_id": "ev-1",
                "filename": "screenshot.png",
                "caption": "Bank Transaction Screenshot",
                "summary": "Shows unauthorized debit transaction.",
                "supports": ["Unauthorized money transfer"],
                "importance": "high",
                "confidence": 0.95,
            }
        ],
        "missing_information_and_evidence": [
            {
                "title": "Bank Transaction UTR",
                "description": "Complainant should provide reference number.",
                "importance": "medium",
            }
        ],
        "contradictions": [],
    })


def test_clean_json_response():
    raw_with_markdown = "```json\n{\"test\": 123}\n```"
    assert _clean_json_response(raw_with_markdown) == "{\"test\": 123}"


@pytest.mark.asyncio
async def test_engine_successful_single_pass():
    valid_json = get_sample_valid_json()
    client = DummyLLMClient([valid_json])
    engine = CaseUnderstandingEngine(llm_client=client, max_retries=2)

    context = CaseContext(complaint_text="Money was stolen online.", evidence=[EvidenceItem(id="ev-1", filename="screenshot.png", type="image")])
    result = await engine.analyze(context)

    assert result.case_id == context.case_id
    assert result.case_understanding.crime_category == "Financial Cybercrime"
    assert len(result.evidence_intelligence) == 1
    assert result.evidence_intelligence[0].caption == "Bank Transaction Screenshot"
    assert client.call_count == 1


@pytest.mark.asyncio
async def test_engine_retry_on_invalid_json():
    invalid_json = "invalid json text"
    valid_json = get_sample_valid_json()
    client = DummyLLMClient([invalid_json, valid_json])
    engine = CaseUnderstandingEngine(llm_client=client, max_retries=2)

    context = CaseContext(complaint_text="Money was stolen online.", evidence=[EvidenceItem(id="ev-1", filename="screenshot.png", type="image")])
    result = await engine.analyze(context)

    assert result.case_understanding.crime_subtype == "UPI Fraud"
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
    assert "You must NOT investigate the case or recommend investigative actions." in prompt
    assert "Never recommend:" in prompt
    assert "PROHIBITED" in prompt
