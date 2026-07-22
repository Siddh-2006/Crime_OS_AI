"""
LLM client contracts and concrete implementations.
Features an abstract ILLMClient, production OllamaLLMClient, and MockLLMClient.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
import httpx

from app.core.exceptions import LLMError
from app.core.logging import logger


class ILLMClient(ABC):
    """Abstract interface for LLM client interaction."""

    @abstractmethod
    async def generate(self, prompt: str, system_prompt: str | None = None) -> str:
        """
        Send prompt and optional system prompt to LLM and return the generated raw string.
        Raises LLMError on failure.
        """
        ...


class OllamaLLMClient(ILLMClient):
    """Concrete client implementation to call a local Ollama server."""

    def __init__(
        self,
        base_url: str,
        model: str,
        timeout: int = 120,
        num_ctx: int = 4096,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.num_ctx = num_ctx

    async def generate(self, prompt: str, system_prompt: str | None = None) -> str:
        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "num_ctx": self.num_ctx,
                "temperature": 0.2,
            },
        }
        if system_prompt:
            payload["system"] = system_prompt

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
                result = data.get("response", "").strip()
                if not result:
                    raise LLMError("Ollama returned an empty response")
                return result
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Ollama HTTP error",
                extra={"status_code": exc.response.status_code, "error": str(exc)},
            )
            raise LLMError(f"Ollama server returned error status: {exc.response.status_code}")
        except httpx.RequestError as exc:
            logger.error(
                "Ollama communication error",
                extra={"error": str(exc)},
            )
            raise LLMError(f"Failed to communicate with Ollama: {exc}")
        except Exception as exc:
            if isinstance(exc, LLMError):
                raise
            logger.error(
                "Ollama unexpected error",
                extra={"error": str(exc)},
            )
            raise LLMError(f"Unexpected error calling Ollama: {exc}")


class MockLLMClient(ILLMClient):
    """Mock client for testing LLM interactions deterministically."""

    def __init__(self, default_response: str = "") -> None:
        self.default_response = default_response
        self.last_prompt: str | None = None
        self.last_system_prompt: str | None = None
        self.custom_responses: dict[str, str] = {}

    def set_response(self, prompt_keyword: str, response: str) -> None:
        self.custom_responses[prompt_keyword] = response

    async def generate(self, prompt: str, system_prompt: str | None = None) -> str:
        self.last_prompt = prompt
        self.last_system_prompt = system_prompt
        for keyword, resp in self.custom_responses.items():
            if keyword in prompt:
                return resp
        return self.default_response
