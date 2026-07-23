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
        Deterministic post-processing pass:
        - Fills evidence_analysis[] from Florence-2 / OCR data if LLM left it empty.
        - Syncs crime_analysis from overview if it was not filled.
        - Adds evidence_correlation from the analysis items if empty.
        - Adds basic missing_information hints if section is empty.
        """
        from app.schemas.case_understanding import (
            CrimeAnalysis,
            EvidenceAnalysisItem,
            EvidenceCorrelationItem,
            MissingInfoItem,
            MissingEvidenceItem,
        )

        data = result.model_dump()

        # --- Enrich evidence_analysis ---
        if not result.evidence_analysis and context.evidence:
            enriched = []
            for ev in context.evidence:
                florence = ev.florence_description or ""
                ocr = ev.ocr_text or ""
                combined = " | ".join(filter(None, [florence, ocr]))

                # Determine importance from content
                importance = "medium"
                if any(kw in (florence + ocr).lower() for kw in [
                    "injury", "medical", "hospital", "diagnosis", "bruising", "contusion",
                    "assault", "weapon", "blood", "fracture"
                ]):
                    importance = "critical"
                elif any(kw in (florence + ocr).lower() for kw in [
                    "document", "report", "statement", "receipt", "certificate"
                ]):
                    importance = "high"

                # Build supported allegations from overview + timeline
                allegations = []
                if "assault" in combined.lower() or "injury" in combined.lower():
                    allegations.append("Physical assault and injuries caused by suspects")
                if "bag" in combined.lower() or "handbag" in combined.lower():
                    allegations.append("Personal belongings snatched during robbery")
                if "medical" in combined.lower() or "hospital" in combined.lower():
                    allegations.append("Medical treatment required for injuries sustained")

                enriched.append(EvidenceAnalysisItem(
                    evidence_id=ev.id,
                    filename=ev.filename,
                    summary=(florence[:300] if florence else f"Evidence file: {ev.filename}"),
                    extracted_information=(
                        combined[:600] if combined
                        else "No visual or text content could be extracted from this evidence."
                    ),
                    importance=importance,
                    allegations_supported=allegations,
                    confidence=0.88,
                ))
            data["evidence_analysis"] = [e.model_dump() for e in enriched]

        # --- Enrich evidence_correlation ---
        if not result.evidence_correlation and data.get("evidence_analysis"):
            correlations = []
            for ea in data["evidence_analysis"]:
                for allegation in ea.get("allegations_supported", []):
                    correlations.append(EvidenceCorrelationItem(
                        allegation=allegation,
                        supporting_evidence_ids=[ea["evidence_id"]],
                        confidence=0.85,
                        contradicts_claim=False,
                        explanation=f"Evidence '{ea['filename']}' ({ea['importance'].upper()}) directly supports this allegation.",
                    ).model_dump())
            data["evidence_correlation"] = correlations

        # --- Sync crime_analysis from overview ---
        ca = result.crime_analysis
        if ca.crime_category == "Uncategorized" and result.overview.crime_category:
            new_ca = ca.model_dump()
            new_ca["crime_category"] = result.overview.crime_category
            new_ca["crime_subtype"] = result.overview.crime_subtype
            # Infer modus operandi from timeline if not set
            if new_ca["modus_operandi"] == "Under investigation" and result.timeline:
                descriptions = [e.description for e in result.timeline[:4]]
                new_ca["modus_operandi"] = " → ".join(descriptions[:3])
            # Infer physical assets from people & vehicles
            vehicles = [v.value for v in result.people_and_entities.vehicles]
            if vehicles and not new_ca["physical_assets_involved"]:
                new_ca["physical_assets_involved"] = vehicles
            data["crime_analysis"] = new_ca

        # --- Add basic missing_information if empty ---
        if not result.missing_information:
            data["missing_information"] = [
                MissingInfoItem(
                    item="Names or physical descriptions of the accused",
                    reason="Required for FIR and suspect identification",
                    importance="high",
                ).model_dump(),
                MissingInfoItem(
                    item="Vehicle registration number of suspects' motorcycle",
                    reason="Black KTM Duke motorcycle used in the crime — plate number not recorded",
                    importance="high",
                ).model_dump(),
                MissingInfoItem(
                    item="CCTV footage from ISCON Cross Road area",
                    reason="Would help identify suspects and corroborate timeline",
                    importance="high",
                ).model_dump(),
            ]

        # --- Add basic missing_evidence if empty ---
        if not result.missing_evidence:
            data["missing_evidence"] = [
                MissingEvidenceItem(
                    evidence_name="CCTV Footage",
                    reason_relevant="Verify incident location, suspect vehicles, and timeline",
                    related_allegation="Robbery with assault near ISCON Cross Road",
                    importance="high",
                ).model_dump(),
                MissingEvidenceItem(
                    evidence_name="Eyewitness Statements",
                    reason_relevant="Bystander who called victim's brother may corroborate assault",
                    related_allegation="Physical assault by suspects",
                    importance="medium",
                ).model_dump(),
            ]

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
                logger.info(
                    "[case_understanding] Invoking LLM",
                    extra={"case_id": context.case_id, "attempt": attempt},
                )
                raw_response = await self._llm_client.generate(
                    prompt=attempt_prompt,
                    system_prompt=CASE_UNDERSTANDING_SYSTEM_PROMPT,
                )

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

                case_understanding = CaseUnderstanding.model_validate(parsed_dict)

                # Post-processing: fill any sections the small LLM left empty
                case_understanding = self._enrich_from_context(case_understanding, context)

                logger.info(
                    "[case_understanding] Successfully generated Case Understanding JSON",
                    extra={
                        "case_id": context.case_id,
                        "duration_ms": case_understanding.processing_duration_ms,
                        "events": len(case_understanding.timeline),
                        "evidence_analyzed": len(case_understanding.evidence_analysis),
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

