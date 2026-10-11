"""
LLM client contracts and concrete implementations.
Features an abstract ILLMClient, production OllamaLLMClient with
Gemini fallback, and MockLLMClient.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any
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
        max_retries: int | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.num_ctx = num_ctx
        self.max_retries = max(1, max_retries or settings.LLM_MAX_RETRIES)

    async def _generate_with_gemini(self, prompt: str, system_prompt: str | None = None) -> str:
        api_keys_str = settings.GEMINI_API_KEY.strip()
        if not api_keys_str:
            raise LLMError(
                "GEMINI_API_KEY is not set. Add it to the complaint-intelligence .env file to enable Gemini fallback."
            )
        
        api_keys = [k.strip() for k in api_keys_str.split(",") if k.strip()]
        last_error = None

        payload: dict[str, Any] = {
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

        import asyncio
        for api_key in api_keys:
            headers = {}
            if api_key.startswith("AQ."):
                headers["Authorization"] = f"Bearer {api_key}"
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent"
            else:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent?key={api_key}"
            for attempt in range(3):
                try:
                    async with httpx.AsyncClient(timeout=self.timeout) as client:
                        response = await client.post(url, json=payload, headers=headers)
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
                        logger.info(
                            "Gemini fallback responded successfully",
                            extra={"model": settings.GEMINI_MODEL, "response_length": len(result)},
                        )
                        return result
                except httpx.HTTPStatusError as exc:
                    last_error = exc
                    logger.warning(f"Gemini key failed with {exc.response.status_code} on attempt {attempt+1}.")
                    if exc.response.status_code in (429, 503):
                        await asyncio.sleep(4 + (attempt * 2)) # sleep 4s, 6s, 8s
                        continue # retry same key
                    if exc.response.status_code in (403, 500):
                        break # Try next key
                    break  # Don't retry on 400 Bad Request
                except httpx.RequestError as exc:
                    last_error = exc
                    if attempt < 2:
                        await asyncio.sleep(4 + (attempt * 2))
                        continue
                    break
                except Exception as exc:
                    last_error = exc
                    if attempt < 2:
                        await asyncio.sleep(4 + (attempt * 2))
                        continue
                    break

        raise LLMError(f"All provided Gemini API keys failed. Last error: {last_error}")

    async def _generate_with_ollama(self, prompt: str, system_prompt: str | None = None) -> str:
        url = f"{self.base_url}/api/generate"
        payload: dict[str, Any] = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "think": False,
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

        timeout_cfg = httpx.Timeout(float(self.timeout), connect=60.0)
        async with httpx.AsyncClient(timeout=timeout_cfg) as client:
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

    async def generate(self, prompt: str, system_prompt: str | None = None) -> str:
        if settings.LLM_BACKEND.lower() == "gemini":
            logger.info("LLM_BACKEND is set to gemini. Bypassing Ollama and using Gemini directly.")
            return await self._generate_with_gemini(prompt, system_prompt)

        last_error: Exception | None = None
        last_message = "Ollama call failed"

        for attempt in range(1, self.max_retries + 1):
            try:
                return await self._generate_with_ollama(prompt, system_prompt)
            except httpx.HTTPStatusError as exc:
                err_detail = str(exc) or repr(exc)
                last_error = exc
                last_message = f"Ollama server returned error status: {exc.response.status_code} - {err_detail}"
                logger.warning(
                    "Ollama HTTP error",
                    extra={
                        "status_code": exc.response.status_code,
                        "attempt": attempt,
                        "max_retries": self.max_retries,
                        "error": err_detail,
                    },
                )
            except httpx.RequestError as exc:
                err_detail = str(exc) or repr(exc)
                last_error = exc
                last_message = f"Failed to communicate with Ollama: {err_detail}"
                logger.warning(
                    "Ollama communication error",
                    extra={"attempt": attempt, "max_retries": self.max_retries, "error": err_detail},
                )
            except LLMError as exc:
                last_error = exc
                last_message = str(exc)
                logger.warning(
                    "Ollama generation error",
                    extra={"attempt": attempt, "max_retries": self.max_retries, "error": str(exc)},
                )
            except Exception as exc:
                err_detail = str(exc) or repr(exc)
                last_error = exc
                last_message = f"Unexpected error calling Ollama: {err_detail}"
                logger.warning(
                    "Ollama unexpected error",
                    extra={"attempt": attempt, "max_retries": self.max_retries, "error": err_detail},
                )

        if settings.GEMINI_API_KEY.strip():
            logger.warning(
                "Ollama failed after retries; falling back to Gemini",
                extra={"max_retries": self.max_retries, "error": last_message},
            )
            return await self._generate_with_gemini(prompt, system_prompt)

        logger.warning(
            "Ollama failed after retries; Gemini fallback skipped because GEMINI_API_KEY is not configured",
            extra={"max_retries": self.max_retries, "error": last_message},
        )
        raise LLMError(f"{last_message} after {self.max_retries} attempt(s)") from last_error


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
