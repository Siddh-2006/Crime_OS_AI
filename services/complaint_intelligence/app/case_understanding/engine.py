"""
Case Understanding Engine implementation.
Executes single-pass LLM analysis over CaseContext and validates the 9-section JSON schema.
"""
from __future__ import annotations

import json
import re
import time
from typing import Optional

from app.case_understanding.interfaces import ICaseUnderstandingEngine
from app.case_understanding.prompt_templates import (
    CASE_UNDERSTANDING_SYSTEM_PROMPT,
    build_case_understanding_user_prompt,
)
from app.core.exceptions import LLMError
from app.core.logging import logger
from app.llm.client import ILLMClient
from app.schemas.case_context import CaseContext
from app.schemas.case_understanding import CaseUnderstanding


def _clean_json_response(raw_text: str) -> str:
    """Extract raw JSON string from potential markdown formatting."""
    cleaned = raw_text.strip()
    # Strip markdown block if present
    match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", cleaned, re.DOTALL)
    if match:
        return match.group(1).strip()
    # If starting with { and ending with }, return as is
    first_brace = cleaned.find("{")
    last_brace = cleaned.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        return cleaned[first_brace : last_brace + 1].strip()
    return cleaned


class CaseUnderstandingEngine(ICaseUnderstandingEngine):
    """
    Executes the single LLM call for case understanding.
    Retries automatically with validation feedback if Pydantic parsing fails.
    After LLM returns, runs a deterministic enrichment pass to fill any
    sections the small model left empty (evidence_analysis, crime_analysis, etc.)
    """

    def __init__(
        self,
        llm_client: ILLMClient,
        max_retries: int = 3,
    ) -> None:
        self._llm_client = llm_client
        self._max_retries = max_retries

    def _enrich_from_context(
        self, result: "CaseUnderstanding", context: "CaseContext"
    ) -> "CaseUnderstanding":
        """
        Deterministic post-processing pass for 5-section Case Understanding:
        - Ensures timeline is populated if LLM returns empty list.
        - Ensures evidence_intelligence contains exactly one entry per uploaded evidence file.
        """
        from app.schemas.case_understanding import EvidenceIntelligenceItem, TimelineEvent

        data = result.model_dump()

        # --- Enrich timeline if empty ---
        if not result.timeline:
            timeline_events = []
            if context.complaint_text:
                summary_desc = (
                    result.case_understanding.complaint_summary
                    or context.complaint_text[:250]
                )
                timeline_events.append(
                    TimelineEvent(
                        timestamp="Incident Date",
                        description=f"Complaint filed: {summary_desc}",
                        supporting_evidence_ids=[],
                        confidence=0.95,
                    ).model_dump()
                )
            for ev in context.evidence:
                ocr = (ev.ocr_text or "").strip()
                florence = (ev.florence_description or "").strip()
                label = "Evidence Date"
                if ocr:
                    clean_ocr = " ".join(ocr.split())[:200]
                    if any(kw in clean_ocr.lower() for kw in ["transaction", "upi", "debited", "paid", "transfer"]):
                        label = "Transaction Record"
                        desc = f"Financial evidence ({ev.filename}): {clean_ocr}"
                    elif any(kw in clean_ocr.lower() for kw in ["call", "missed", "incoming", "phone", "dial"]):
                        label = "Call Record"
                        desc = f"Phone record ({ev.filename}): {clean_ocr}"
                    else:
                        desc = f"Evidence '{ev.filename}' OCR content: {clean_ocr}"
                elif florence:
                    desc = f"Evidence '{ev.filename}': {florence[:180]}"
                else:
                    desc = f"Evidence file uploaded: {ev.filename}"

                timeline_events.append(
                    TimelineEvent(
                        timestamp=label,
                        description=desc,
                        supporting_evidence_ids=[ev.id],
                        confidence=0.88,
                    ).model_dump()
                )
            data["timeline"] = timeline_events

        # --- Ensure evidence_intelligence has exactly one entry per evidence file ---
        existing_items = data.get("evidence_intelligence") or []
        existing_ids = {str(item.get("evidence_id")) for item in existing_items if isinstance(item, dict)}

        for ev in context.evidence:
            if ev.id not in existing_ids:
                florence = (ev.florence_description or "").strip()
                ocr = (ev.ocr_text or "").strip()
                caption_title = f"{ev.filename or 'Evidence'} file"
                summary_text = florence[:200] if florence else (f"Extracted text: {ocr[:150]}" if ocr else f"Uploaded evidence document {ev.filename}")

                existing_items.append({
                    "evidence_id": ev.id,
                    "filename": ev.filename or ev.id,
                    "caption": caption_title,
                    "summary": summary_text,
                    "supports": ["Supports complaint allegations"],
                    "importance": "high",
                    "confidence": 0.9,
                })
                existing_ids.add(ev.id)

        data["evidence_intelligence"] = existing_items

        return result.model_validate(data)

    async def analyze(self, context: CaseContext) -> CaseUnderstanding:
        t0 = time.monotonic()
        logger.info(
            "[case_understanding] Starting single-pass LLM analysis",
            extra={"case_id": context.case_id, "evidence_count": len(context.evidence)},
        )

        context_json = context.model_dump_json()
        user_prompt = build_case_understanding_user_prompt(context_json)

        attempt_prompt = user_prompt
        last_error: Optional[Exception] = None

        for attempt in range(1, self._max_retries + 1):
            try:
                print(f"  🧠 [LLM Engine] Invoking single-pass LLM Case Understanding analysis (Attempt {attempt}/{self._max_retries})...", flush=True)
                logger.info(
                    "[case_understanding] Invoking LLM",
                    extra={"case_id": context.case_id, "attempt": attempt},
                )
                raw_response = await self._llm_client.generate(
                    prompt=attempt_prompt,
                    system_prompt=CASE_UNDERSTANDING_SYSTEM_PROMPT,
                )
                print(f"  ✓ [LLM Engine] Received response ({len(raw_response)} chars). Parsing 5-section Case Understanding JSON...", flush=True)

                cleaned_json = _clean_json_response(raw_response)

                # Parse JSON dict first to inject case_id and original_complaint if missing
                try:
                    import json_repair
                    parsed_dict = json_repair.repair_json(cleaned_json, return_objects=True)
                except Exception:
                    parsed_dict = json.loads(cleaned_json)

                if not isinstance(parsed_dict, dict):
                    raise ValueError("LLM response did not parse as a JSON object")

                parsed_dict["case_id"] = context.case_id
                parsed_dict["original_complaint"] = context.complaint_text
                parsed_dict["processing_duration_ms"] = round((time.monotonic() - t0) * 1000, 2)

                # Robust default injection for case_understanding section if LLM omits fields
                cu_section = parsed_dict.get("case_understanding") or parsed_dict.get("overview")
                if not isinstance(cu_section, dict):
                    cu_section = {}
                exec_sum = cu_section.get("executive_summary") or cu_section.get("complaint_summary") or (context.complaint_text or "Complaint filed")[:300]
                inc_brief = cu_section.get("incident_brief") or cu_section.get("incident_overview") or (context.complaint_text or "Case under investigation")
                cu_section["executive_summary"] = exec_sum
                cu_section["incident_brief"] = inc_brief
                cu_section["complaint_summary"] = exec_sum
                cu_section["incident_overview"] = inc_brief
                if not cu_section.get("crime_category"):
                    cu_section["crime_category"] = str(context.complaint_metadata.get("category", "Cybercrime"))
                if not cu_section.get("crime_subtype"):
                    cu_section["crime_subtype"] = "Online Banking Fraud"
                if not cu_section.get("priority"):
                    cu_section["priority"] = "high"
                if not cu_section.get("confidence"):
                    cu_section["confidence"] = 0.95
                parsed_dict["case_understanding"] = cu_section

                # Repair timeline if LLM returns array of strings
                raw_timeline = parsed_dict.get("timeline")
                if isinstance(raw_timeline, list):
                    repaired_timeline = []
                    for item in raw_timeline:
                        if isinstance(item, str):
                            repaired_timeline.append({"timestamp": "Incident Date", "description": item, "supporting_evidence_ids": [], "confidence": 0.9})
                        elif isinstance(item, dict):
                            repaired_timeline.append(item)
                    parsed_dict["timeline"] = repaired_timeline

                # Repair missing_information_and_evidence if LLM returns array of strings
                raw_mie = parsed_dict.get("missing_information_and_evidence")
                if isinstance(raw_mie, list):
                    repaired_mie = []
                    for item in raw_mie:
                        if isinstance(item, str):
                            repaired_mie.append({"title": item, "description": "Clarification or document requested from complainant", "importance": "medium"})
                        elif isinstance(item, dict):
                            repaired_mie.append(item)
                    parsed_dict["missing_information_and_evidence"] = repaired_mie

                # Repair evidence_intelligence if LLM returns items with missing required fields
                raw_ei = parsed_dict.get("evidence_intelligence") or parsed_dict.get("evidence_analysis")
                if isinstance(raw_ei, list):
                    repaired_ei = []
                    for item in raw_ei:
                        if isinstance(item, dict):
                            ev_id = str(item.get("evidence_id") or "ev-unknown")
                            fname = str(item.get("filename") or "evidence_file")
                            cap = str(item.get("caption") or item.get("summary") or "Evidence file")
                            summ = str(item.get("summary") or item.get("caption") or "Evidence provided")
                            repaired_ei.append({
                                "evidence_id": ev_id,
                                "filename": fname,
                                "caption": cap,
                                "summary": summ,
                                "supports": item.get("supports") or item.get("allegations_supported") or [],
                                "importance": str(item.get("importance") or "medium"),
                                "confidence": float(item.get("confidence") or 0.9),
                            })
                    parsed_dict["evidence_intelligence"] = repaired_ei

                case_understanding = CaseUnderstanding.model_validate(parsed_dict)

                # Post-processing: fill any sections the small LLM left empty
                case_understanding = self._enrich_from_context(case_understanding, context)

                logger.info(
                    "[case_understanding] Successfully generated Case Understanding JSON",
                    extra={
                        "case_id": context.case_id,
                        "duration_ms": case_understanding.processing_duration_ms,
                        "events": len(case_understanding.timeline),
                        "evidence_analyzed": len(case_understanding.evidence_intelligence),
                        "attempt": attempt,
                    },
                )
                return case_understanding

            except Exception as exc:
                last_error = exc
                logger.warning(
                    "[case_understanding] Attempt failed validation/parsing",
                    extra={"case_id": context.case_id, "attempt": attempt, "error": str(exc)},
                )
                if attempt < self._max_retries:
                    attempt_prompt = (
                        f"{user_prompt}\n\n"
                        f"Previous response failed validation with error: {exc}\n"
                        "Please correct the output format and return strict valid JSON matching the schema."
                    )

        raise LLMError(
            f"Case Understanding LLM analysis failed after {self._max_retries} attempts: {last_error}"
        ) from last_error

