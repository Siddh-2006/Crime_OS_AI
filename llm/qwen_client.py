from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Protocol


class TextBackend(Protocol):
    def generate(self, prompt: str, *, max_new_tokens: int = 1024, temperature: float = 0.2, top_p: float = 0.9) -> str:
        ...


@dataclass(slots=True)
class TransformersTextBackend:
    model_name: str = "Qwen/Qwen3-8B-Instruct"
    device: str | None = None
    torch_dtype: str | None = "auto"

    def __post_init__(self) -> None:
        self._tokenizer = None
        self._model = None

    def _load(self):
        if self._model is not None and self._tokenizer is not None:
            return self._tokenizer, self._model
        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer
        except Exception as exc:  # pragma: no cover - dependency missing
            raise RuntimeError(
                "transformers and torch are required for local Qwen inference."
            ) from exc
        tokenizer = AutoTokenizer.from_pretrained(self.model_name, trust_remote_code=True)
        model_kwargs = {"trust_remote_code": True}
        if self.torch_dtype == "auto":
            model_kwargs["torch_dtype"] = "auto"
        elif self.torch_dtype:
            model_kwargs["torch_dtype"] = getattr(torch, self.torch_dtype, self.torch_dtype)
        model = AutoModelForCausalLM.from_pretrained(self.model_name, **model_kwargs)
        if self.device is not None:
            model = model.to(self.device)
        self._tokenizer = tokenizer
        self._model = model
        return tokenizer, model

    def generate(self, prompt: str, *, max_new_tokens: int = 1024, temperature: float = 0.2, top_p: float = 0.9) -> str:
        tokenizer, model = self._load()
        inputs = tokenizer(prompt, return_tensors="pt")
        if hasattr(model, "device"):
            inputs = {key: value.to(model.device) for key, value in inputs.items()}
        generation_kwargs = {
            "max_new_tokens": max_new_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "do_sample": temperature > 0,
            "pad_token_id": getattr(tokenizer, "eos_token_id", None),
        }
        output = model.generate(**inputs, **generation_kwargs)
        decoded = tokenizer.decode(output[0], skip_special_tokens=True)
        return decoded[len(prompt) :].strip() if decoded.startswith(prompt) else decoded.strip()


def _extract_json(text: str) -> dict:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.I)
        stripped = re.sub(r"\s*```$", "", stripped)
    try:
        return json.loads(stripped)
    except Exception:
        match = re.search(r"\{.*\}", stripped, flags=re.S)
        if match:
            return json.loads(match.group(0))
        raise


class QwenClient:
    def __init__(
        self,
        *,
        backend: TextBackend | None = None,
        model_name: str = "Qwen/Qwen3-8B-Instruct",
        device: str | None = None,
    ) -> None:
        self.backend = backend or TransformersTextBackend(model_name=model_name, device=device)

    @staticmethod
    def build_analysis_prompt(complaint: str, sections: str) -> str:
        return (
            "You are a legal copilot.\n\n"
            "You may ONLY use the supplied legal provisions.\n"
            "Do not rely on prior knowledge outside the supplied context.\n"
            "If evidence is insufficient, say so explicitly.\n"
            "Do not invent laws.\n\n"
            "Every reasoning claim must include at least one citation from the supplied section IDs.\n"
            "Do not produce any reasoning claim without citations.\n"
            "Every explanation entry must identify a section and the complaint facts that support it.\n"
            "Use only the supplied section IDs in citations.\n\n"
            f"Complaint:\n{complaint}\n\n"
            f"Retrieved Legal Material:\n{sections}\n\n"
            "Tasks:\n"
            "1. Identify applicable legal sections.\n"
            "2. Explain why each section applies by mapping legal elements to complaint facts.\n"
            "3. Ensure every reasoning claim contains citations.\n"
            "4. Mention uncertainty if evidence is insufficient.\n"
            "5. Do not invent laws.\n"
            "6. Do not rely on prior knowledge outside the supplied context.\n\n"
            "Return only valid JSON with this schema:\n"
            "{\n"
            '  "query": "...",\n'
            '  "applicable_sections": [{"act": "...", "section": "...", "relevance_score": 0.0}],\n'
            '  "explanation": [{"section": "ACT_123", "matched_elements": [{"legal_element": "...", "complaint_fact": "..."}]}],\n'
            '  "reasoning": [{"claim": "...", "citations": ["ACT_123"]}],\n'
            '  "supporting_sections": [{"section": "ACT_123", "context_type": "referenced_section"}]\n'
            "}\n"
        )

    @staticmethod
    def build_prompt(complaint: str, sections: str) -> str:
        return QwenClient.build_analysis_prompt(complaint, sections)

    def generate(self, prompt: str, *, max_new_tokens: int = 1024, temperature: float = 0.2, top_p: float = 0.9) -> str:
        return self.backend.generate(prompt, max_new_tokens=max_new_tokens, temperature=temperature, top_p=top_p)

    def generate_structured_analysis(
        self,
        *,
        complaint: str,
        sections: str,
        max_new_tokens: int = 1024,
        temperature: float = 0.2,
        top_p: float = 0.9,
    ) -> dict:
        prompt = self.build_analysis_prompt(complaint, sections)
        raw = self.generate(prompt, max_new_tokens=max_new_tokens, temperature=temperature, top_p=top_p)
        try:
            return _extract_json(raw)
        except Exception:
            return {
                "query": complaint,
                "applicable_sections": [],
                "explanation": [],
                "reasoning": [],
                "supporting_sections": [],
            }

    def generate_grounded_answer(
        self,
        *,
        complaint: str,
        sections: str,
        max_new_tokens: int = 1024,
        temperature: float = 0.2,
        top_p: float = 0.9,
    ) -> dict:
        return self.generate_structured_analysis(
            complaint=complaint,
            sections=sections,
            max_new_tokens=max_new_tokens,
            temperature=temperature,
            top_p=top_p,
        )
