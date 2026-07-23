"""
Unit tests for the LLM Client.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
import httpx
import pytest

from app.core.config import settings
from app.core.exceptions import LLMError
from app.llm.client import MockLLMClient, OllamaLLMClient


@pytest.mark.unit
@pytest.mark.asyncio
async def test_mock_llm_client_default_response():
    client = MockLLMClient(default_response="hello")
    res = await client.generate("any prompt")
    assert res == "hello"
    assert client.last_prompt == "any prompt"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_mock_llm_client_custom_response():
    client = MockLLMClient(default_response="hello")
    client.set_response(prompt_keyword="translate", response="hola")
    res = await client.generate("please translate this")
    assert res == "hola"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_ollama_client_success():
    client = OllamaLLMClient(base_url="http://localhost:11434", model="gemma4:e2b")

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"response": "test output"}
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient.post", return_value=mock_response) as mock_post:
        res = await client.generate("my prompt", system_prompt="sys")
        assert res == "test output"
        mock_post.assert_called_once()
        called_args, called_kwargs = mock_post.call_args
        assert called_args[0] == "http://localhost:11434/api/generate"
        payload = called_kwargs["json"]
        assert payload["model"] == "gemma4:e2b"
        assert payload["prompt"] == "my prompt"
        assert payload["system"] == "sys"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_ollama_client_empty_response():
    client = OllamaLLMClient(base_url="http://localhost:11434", model="gemma4:e2b")

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"response": ""}
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient.post", return_value=mock_response):
        with pytest.raises(LLMError) as exc_info:
            await client.generate("my prompt")
        assert "empty response" in str(exc_info.value)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_ollama_client_http_error():
    client = OllamaLLMClient(base_url="http://localhost:11434", model="gemma4:e2b")

    request = httpx.Request("POST", "http://localhost:11434/api/generate")
    response = httpx.Response(500, request=request)

    with patch(
        "httpx.AsyncClient.post",
        side_effect=httpx.HTTPStatusError("Internal Server Error", request=request, response=response),
    ):
        with pytest.raises(LLMError) as exc_info:
            await client.generate("my prompt")
        assert "returned error status: 500" in str(exc_info.value)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_ollama_client_connection_error():
    client = OllamaLLMClient(base_url="http://localhost:11434", model="gemma4:e2b")

    request = httpx.Request("POST", "http://localhost:11434/api/generate")

    with patch("httpx.AsyncClient.post", side_effect=httpx.RequestError("Connection failed", request=request)):
        with pytest.raises(LLMError) as exc_info:
            await client.generate("my prompt")
        assert "Failed to communicate with Ollama" in str(exc_info.value)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_ollama_client_generic_error():
    client = OllamaLLMClient(base_url="http://localhost:11434", model="gemma4:e2b")

    with patch("httpx.AsyncClient.post", side_effect=RuntimeError("Unexpected crash")):
        with pytest.raises(LLMError) as exc_info:
            await client.generate("my prompt")
        assert "Unexpected error calling Ollama" in str(exc_info.value)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_ollama_client_falls_back_to_gemini():
    client = OllamaLLMClient(base_url="http://localhost:11434", model="gemma4:e2b")

    request = httpx.Request("POST", "http://localhost:11434/api/generate")

    with patch.object(settings, "GEMINI_API_KEY", "test-key"):
        with patch("httpx.AsyncClient.post", side_effect=httpx.RequestError("Connection failed", request=request)):
            with patch.object(client, "_generate_with_gemini", return_value="fallback output") as mock_gemini:
                res = await client.generate("my prompt", system_prompt="sys")
                assert res == "fallback output"
                mock_gemini.assert_called_once_with("my prompt", "sys")
