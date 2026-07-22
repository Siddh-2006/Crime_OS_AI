"""
ComplaintProfileWorker — parses and profiles complaint texts using the LLM.
Handles translation, normalization, profiling, and validation.
"""
from __future__ import annotations

import json
import re
from langdetect import detect
from langdetect.lang_detect_exception import LangDetectException

from app.base.worker import BaseWorker, ProgressUpdate
from app.core.exceptions import LLMError
from app.llm.client import ILLMClient
from app.schemas.complaint import ComplaintProfile

SYSTEM_PROMPT = """
You are a Principal AI Architect and Police Investigation Assistant.
Your task is to analyze a raw complaint text and extract a structured profile.
You MUST respond with valid JSON only. Do not wrap the JSON in markdown code blocks, do not include any explanatory text, and do not include any other output.

The JSON MUST conform to the following schema:
{
  "crime_type": "string - classified type of crime (e.g. cyber_financial_fraud, missing_person, burglary, domestic_violence)",
  "priority": "string - low, medium, high, or critical",
  "summary": "string - a concise, neutral summary of the key facts",
  "missing_information": ["array of strings - critical information missing from the complaint text that is needed for investigation"],
  "recommendations": ["array of strings - recommended next steps for the investigation"],
  "confidence": "number - float between 0.0 and 1.0 indicating confidence in classification"
}
"""


def clean_json_response(raw_text: str) -> str:
    """Strip markdown fences if model wraps output."""
    cleaned = raw_text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


class ComplaintProfileWorker(BaseWorker[dict, dict]):
    """
    Worker to process raw complaint text.
    Steps:
      1. Clean whitespace
      2. Detect language (using langdetect)
      3. Translate to English if non-English (using LLM translation prompt)
      4. Call LLM with profiling system prompt
      5. Parse & validate LLM JSON response against ComplaintProfile schema
    """

    worker_name = "complaint_profile_worker"

    def __init__(self, llm_client: ILLMClient) -> None:
        super().__init__()
        self.llm_client = llm_client

    async def process(self, *, job_id: str, payload: dict, attempt: int) -> dict:
        text = payload.get("text")
        if not text:
            raise ValueError("Payload must contain 'text'")

        # Step 1: Clean text
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="cleaning", percent=0.1, message="Cleaning input text")
        )
        cleaned_text = text.strip()

        # Step 2: Language detection
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="language_detection", percent=0.3, message="Detecting language")
        )
        lang = "en"
        try:
            lang = detect(cleaned_text)
        except (LangDetectException, Exception):
            # Fallback to English if detection fails
            pass

        # Step 3: Optional translation hook
        if lang != "en":
            self.report_progress(
                ProgressUpdate(
                    job_id=job_id,
                    step="translation",
                    percent=0.5,
                    message=f"Translating complaint from '{lang}' to English",
                )
            )
            translation_prompt = (
                "Translate the following text to English. Return ONLY the translated text, "
                f"with no explanation or markdown formatting:\n\n{cleaned_text}"
            )
            try:
                translated = await self.llm_client.generate(
                    prompt=translation_prompt,
                    system_prompt="You are a professional translator.",
                )
                cleaned_text = translated.strip()
            except Exception:
                # If translation fails, we fallback to original text and let the profiling attempt to parse it
                pass

        # Step 4: Profile with LLM
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="profiling", percent=0.7, message="Profiling complaint text")
        )
        user_prompt = f"Analyze the following complaint text:\n\n{cleaned_text}"
        raw_response = await self.llm_client.generate(
            prompt=user_prompt,
            system_prompt=SYSTEM_PROMPT,
        )

        # Step 5: Parse & validate
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="validation", percent=0.9, message="Validating LLM response")
        )
        try:
            cleaned_response = clean_json_response(raw_response)
            data = json.loads(cleaned_response)
            profile = ComplaintProfile.model_validate(data)
        except Exception as exc:
            raise LLMError(f"Failed to parse or validate LLM response: {exc}")

        self.report_progress(
            ProgressUpdate(job_id=job_id, step="completed", percent=1.0, message="Complaint profiling complete")
        )
        return profile.model_dump()
