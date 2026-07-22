"""
Unit tests for the ComplaintProfileWorker.
"""
from __future__ import annotations

import json
import pytest

from app.core.exceptions import LLMError
from app.llm.client import MockLLMClient
from app.llm.worker import ComplaintProfileWorker


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_english_complaint():
    mock_llm = MockLLMClient()
    profile_data = {
        "crime_type": "cyber_financial_fraud",
        "priority": "high",
        "summary": "Victim lost Rs 48000.",
        "missing_information": ["UPI ID of receiver"],
        "recommendations": ["Trace bank account"],
        "confidence": 0.95,
    }
    mock_llm.set_response(prompt_keyword="Analyze the following complaint text", response=json.dumps(profile_data))

    worker = ComplaintProfileWorker(mock_llm)
    result = await worker.run({"text": "I lost money online via fake link."})

    assert result.succeeded is True
    assert result.output is not None
    assert result.output["crime_type"] == "cyber_financial_fraud"
    assert result.output["priority"] == "high"
    assert result.output["confidence"] == 0.95


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_camel_case_handling():
    mock_llm = MockLLMClient()
    profile_data = {
        "crimeType": "missing_person",
        "priority": "critical",
        "summary": "16 year old child missing.",
        "missingInformation": ["Last seen clothes"],
        "recommendations": ["Check local CCTV"],
        "confidence": 0.9,
    }
    mock_llm.set_response(prompt_keyword="Analyze the following complaint text", response=json.dumps(profile_data))

    worker = ComplaintProfileWorker(mock_llm)
    result = await worker.run({"text": "My son is missing since yesterday."})

    assert result.succeeded is True
    assert result.output is not None
    assert result.output["crime_type"] == "missing_person"
    assert result.output["priority"] == "critical"
    assert result.output["missing_information"] == ["Last seen clothes"]


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_translation_trigger():
    mock_llm = MockLLMClient()
    # Mock translation response
    mock_llm.set_response(
        prompt_keyword="Translate the following text to English", response="Hello, my wallet has been stolen."
    )

    # Mock profiling response for the translated text
    profile_data = {
        "crime_type": "general_theft",
        "priority": "low",
        "summary": "Wallet stolen.",
        "missing_information": [],
        "recommendations": [],
        "confidence": 0.5,
    }
    mock_llm.set_response(prompt_keyword="Hello, my wallet has been stolen", response=json.dumps(profile_data))

    worker = ComplaintProfileWorker(mock_llm)
    # Hindi text
    result = await worker.run({"text": "मेरा बटुआ चोरी हो गया है"})

    assert result.succeeded is True
    assert result.output is not None
    assert result.output["crime_type"] == "general_theft"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_invalid_json_raises_llm_error():
    mock_llm = MockLLMClient(default_response="Not valid JSON response")
    worker = ComplaintProfileWorker(mock_llm)
    result = await worker.run({"text": "Valid English text"})

    assert result.succeeded is False
    assert result.error is not None
    assert "Failed to parse or validate LLM response" in result.error


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_missing_text_payload_raises_error():
    mock_llm = MockLLMClient()
    worker = ComplaintProfileWorker(mock_llm)
    with pytest.raises(ValueError) as exc_info:
        await worker.process(job_id="test", payload={}, attempt=1)
    assert "Payload must contain 'text'" in str(exc_info.value)
