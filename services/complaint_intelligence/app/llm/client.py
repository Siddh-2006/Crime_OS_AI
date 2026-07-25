"""
LLM client contracts and concrete implementations.
Features an abstract ILLMClient, production OllamaLLMClient with
Gemini fallback, and MockLLMClient.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
import httpx

from app.core.config import settings
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
    """Concrete client implementation to call a local Ollama server.

    Primary path: Ollama.
    Fallback path: Gemini cloud model whenever Ollama is unreachable or fails.
    """

    def __init__(
        self,
        base_url: str,
        model: str,
        timeout: int = 300,
        num_ctx: int = 4096,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.num_ctx = num_ctx

    async def _generate_with_gemini(self, prompt: str, system_prompt: str | None = None) -> str:
        api_key = settings.GEMINI_API_KEY.strip()
        if not api_key:
            raise LLMError(
                "GEMINI_API_KEY is not set. Add it to the complaint-intelligence .env file to enable Gemini fallback."
            )

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent?key={api_key}"
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": prompt}],
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
            },
        }

        if system_prompt:
            payload["systemInstruction"] = {
                "parts": [{"text": system_prompt}],
            }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
                result = (
                    data.get("candidates", [{}])[0]
                    .get("content", {})
                    .get("parts", [{}])[0]
                    .get("text", "")
                    .strip()
                )
                if not result:
                    raise LLMError("Gemini returned an empty response")
                return result
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Gemini HTTP error",
                extra={"status_code": exc.response.status_code, "error": str(exc)},
            )
            raise LLMError(f"Gemini API returned error status: {exc.response.status_code}")
        except httpx.RequestError as exc:
            logger.warning(
                "Gemini communication error",
                extra={"error": str(exc)},
            )
            raise LLMError(f"Failed to communicate with Gemini: {exc}")
        except Exception as exc:
            if isinstance(exc, LLMError):
                raise
            logger.error(
                "Gemini unexpected error",
                extra={"error": str(exc)},
            )
            raise LLMError(f"Unexpected error calling Gemini: {exc}")

    async def generate(self, prompt: str, system_prompt: str | None = None) -> str:
        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "format": "json",
            "options": {
                "num_ctx": self.num_ctx,
                "num_predict": 2048,
                "num_thread": 8,
                "temperature": 0.1,
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
                if "<think>" in result and "</think>" in result:
                    import re
                    result = re.sub(r"<think>.*?</think>", "", result, flags=re.DOTALL).strip()
                if not result:
                    raise LLMError("Ollama returned an empty response")
                return result
        except httpx.HTTPStatusError as exc:
            logger.warning(
                "Ollama HTTP error",
                extra={"status_code": exc.response.status_code, "error": str(exc)},
            )
            if settings.GEMINI_API_KEY.strip():
                logger.warning("Falling back to Gemini")
                return await self._generate_with_gemini(prompt, system_prompt)
            raise LLMError(f"Ollama server returned error status: {exc.response.status_code}")
        except httpx.RequestError as exc:
            logger.warning(
                "Ollama communication error",
                extra={"error": str(exc)},
            )
            if settings.GEMINI_API_KEY.strip():
                logger.warning("Falling back to Gemini")
                return await self._generate_with_gemini(prompt, system_prompt)
            raise LLMError(f"Failed to communicate with Ollama: {exc}")
        except Exception as exc:
            if isinstance(exc, LLMError):
                raise
            logger.warning(
                "Ollama unexpected error",
                extra={"error": str(exc)},
            )
            if settings.GEMINI_API_KEY.strip():
                logger.warning("Falling back to Gemini")
                return await self._generate_with_gemini(prompt, system_prompt)
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
