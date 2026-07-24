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

        # --- Enrich timeline if empty ---
        if not result.timeline:
            from app.schemas.case_understanding import TimelineEvent
            timeline_events = []
            if context.complaint_text:
                timeline_events.append(
                    TimelineEvent(
                        timestamp="Incident Date",
                        description=result.overview.complaint_summary or context.complaint_text[:200],
                        supporting_evidence_ids=[],
                        confidence=0.9,
                    ).model_dump()
                )
            for ev in context.evidence:
                if ev.ocr_text or ev.florence_description:
                    desc = (ev.florence_description[:150] if ev.florence_description else f"Evidence extracted: {ev.ocr_text[:150]}")
                    timeline_events.append(
                        TimelineEvent(
                            timestamp="Evidence Date",
                            description=f"Evidence '{ev.filename}': {desc}",
                            supporting_evidence_ids=[ev.id],
                            confidence=0.85,
                        ).model_dump()
                    )
            data["timeline"] = timeline_events

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
        new_ca = ca.model_dump()
        if ca.crime_category == "Uncategorized" and result.overview.crime_category:
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

        # --- Regex fallback: extract financial loss if LLM left it as 0 or None ---
        if not new_ca.get("estimated_financial_loss"):
            # Collect complaint text first (most reliable), then OCR
            complaint_only = context.complaint_text or ""
            ocr_corpus = ""
            for ev in context.evidence:
                if ev.ocr_text:
                    ocr_corpus += " " + ev.ocr_text

            # ── Pass 1: Look for explicit total/loss context in complaint text ──
            # e.g. "total amount of ₹1,85,000" / "fraud of Rs. 48,000" / "lost ₹75,000"
            total_pattern = re.compile(
                r"(?:total|loss|fraud|cheated|defraud|stolen|debited|amount)\s+(?:of\s+)?(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)",
                re.IGNORECASE,
            )
            # Also match standalone ₹ amounts in complaint text
            currency_pattern = re.compile(
                r"(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)",
                re.IGNORECASE,
            )

            def parse_amount(raw: str) -> float:
                try:
                    val = float(raw.replace(",", ""))
                    # Plausible fraud amount: ₹1 to ₹1 crore
                    # Exclude obvious account numbers / timestamps
                    if 1.0 <= val <= 10_000_000.0:
                        return val
                except ValueError:
                    pass
                return 0.0

            # Try explicit total-context match first (complaint only)
            total_amounts = [parse_amount(m.group(1)) for m in total_pattern.finditer(complaint_only)]
            total_amounts = [a for a in total_amounts if a > 0]

            if total_amounts:
                # Use the largest explicitly stated total
                loss = max(total_amounts)
            else:
                # Pass 2: collect all plausible ₹ amounts from complaint text
                all_amounts = [parse_amount(m.group(1)) for m in currency_pattern.finditer(complaint_only)]
                all_amounts = [a for a in all_amounts if a > 0]
                if not all_amounts:
                    # Last resort: scan OCR too
                    all_amounts = [parse_amount(m.group(1)) for m in currency_pattern.finditer(ocr_corpus)]
                    all_amounts = [a for a in all_amounts if a > 0]
                # Take the maximum single amount (avoids double-counting)
                loss = max(all_amounts) if all_amounts else 0.0

            if loss > 0:
                new_ca["estimated_financial_loss"] = loss
                logger.info(
                    "[enrich] Regex extracted financial loss: %.2f from complaint text",
                    loss,
                )

        data["crime_analysis"] = new_ca

        # --- Entity Extraction Fallback for people_and_entities ---
        pe_dict = data.get("people_and_entities", {})
        search_corpus = (context.complaint_text or "") + " "
        for ev in context.evidence:
            if ev.ocr_text:
                search_corpus += ev.ocr_text + " "

        # 1. UPI IDs (e.g. rahultraders@okaxis, user@ybl, etc.)
        if not pe_dict.get("upi_ids"):
            upi_matches = set(re.findall(r"\b[a-zA-Z0-9\.\-_]+@[a-zA-Z]{2,}\b", search_corpus))
            if upi_matches:
                pe_dict["upi_ids"] = [{"value": u, "source_evidence_ids": [], "confidence": 0.95} for u in upi_matches]

        # 2. Phone Numbers (e.g. +919034567812, 9034567812)
        if not pe_dict.get("phone_numbers"):
            phone_matches = set(re.findall(r"\b(?:\+91[\s\-]?)?[6-9]\d{9}\b", search_corpus))
            if phone_matches:
                pe_dict["phone_numbers"] = [{"value": p, "source_evidence_ids": [], "confidence": 0.9} for p in phone_matches]

        # 3. Bank Account numbers / Masked accounts (e.g. Account XX4582 or A/C 9876543210)
        if not pe_dict.get("bank_accounts"):
            acct_matches = set(re.findall(r"\b(?:A/C|Account|Acct|Acc)\b\s*[:\.\-]?\s*([X\*\d]{4,18})\b", search_corpus, re.IGNORECASE))
            if acct_matches:
                pe_dict["bank_accounts"] = [{"value": a, "source_evidence_ids": [], "confidence": 0.9} for a in acct_matches if len(a) >= 4]

        data["people_and_entities"] = pe_dict

        # --- Add basic missing_information if empty ---
        # Only add a truly generic placeholder — NEVER hardcode complaint-specific entities here.
        if not result.missing_information:
            data["missing_information"] = [
                MissingInfoItem(
                    item="Identity details of the accused",
                    reason="Required for FIR registration and suspect identification",
                    importance="high",
                ).model_dump(),
            ]

        # --- Add basic missing_evidence if empty ---
        # Derive sensible defaults from the complaint category/overview only.
        if not result.missing_evidence:
            category_lower = (result.overview.crime_category or "").lower()
            if "cyber" in category_lower or "fraud" in category_lower or "upi" in category_lower or "banking" in category_lower:
                data["missing_evidence"] = [
                    MissingEvidenceItem(
                        evidence_name="Call Detail Records (CDR)",
                        reason_relevant="Trace the phone number used by the accused to contact the victim",
                        related_allegation="Accused contacted victim via phone to perpetrate the fraud",
                        importance="high",
                    ).model_dump(),
                    MissingEvidenceItem(
                        evidence_name="Bank Transaction Statement",
                        reason_relevant="Official statement confirming all unauthorized debits and beneficiary details",
                        related_allegation="Unauthorized financial transactions from victim's account",
                        importance="high",
                    ).model_dump(),
                ]
            else:
                data["missing_evidence"] = [
                    MissingEvidenceItem(
                        evidence_name="Supporting Documentary Evidence",
                        reason_relevant="Additional documentation to corroborate the complaint",
                        related_allegation="As described in the complaint",
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

