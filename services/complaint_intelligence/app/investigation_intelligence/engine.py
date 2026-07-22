"""
Milestone 12 — Investigation Intelligence Engine (Gemma4 E2B via ILLMClient).

Purpose: Intelligent Complaint Representation & Understanding.

Transforms ComplaintProfile, EvidenceProfiles, and TimelineIntelligence into a
structured, semantically enriched InvestigationIntelligence object.

This module does NOT generate action plans, recommendations, or investigative decisions.

InvestigationIntelligenceEngine  — LLM-backed engine.
InvestigationFallbackEngine       — Deterministic fallback when LLM is unavailable.
_build_deterministic_intelligence — Core deterministic logic (used by fallback and on LLM failure).
_build_structured_intelligence    — Maps validated LLM dict to InvestigationIntelligence.
"""
from __future__ import annotations

import json
import re
import time
import uuid
from typing import Any

from app.core.logging import get_logger
from app.llm.client import ILLMClient
from app.investigation_intelligence.interfaces import IInvestigationIntelligenceEngine
from app.investigation_intelligence.prompt import (
    build_investigation_intelligence_prompt,
)
from app.schemas.investigation_intelligence import (
    CrimeClassification,
    InvestigationIntelligence,
    InvestigationIntelligenceInput,
    InvestigationRiskAssessment,
    InvestigationRiskFactor,
    KeyEntitySummary,
    MissingEvidenceGap,
)
from app.schemas.timeline_intelligence import TimelineContradiction

logger = get_logger(__name__)

_JSON_BLOCK_RE = re.compile(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", re.IGNORECASE)


class InvestigationIntelligenceEngine(IInvestigationIntelligenceEngine):
    """
    Model-agnostic Investigation Intelligence Engine.

    Communicates with AI exclusively via ILLMClient (configured for Gemma4 E2B).
    Gracefully degrades to deterministic InvestigationFallbackEngine on any failure.
    """

    def __init__(
        self,
        llm_client: ILLMClient,
        model_name: str | None = None,
    ) -> None:
        self._llm_client = llm_client
        self._model_name = model_name

    async def analyze(
        self, payload: InvestigationIntelligenceInput
    ) -> InvestigationIntelligence:
        """Analyze case payload and return structured InvestigationIntelligence."""
        t0 = time.perf_counter()
        intelligence_id = str(uuid.uuid4())

        logger.info(
            "InvestigationIntelligenceEngine started",
            extra={
                "intelligence_id": intelligence_id,
                "evidence_count": len(payload.evidence_profiles),
            },
        )

        system_prompt, user_prompt = build_investigation_intelligence_prompt(payload)

        try:
            raw_response = await self._llm_client.generate(
                prompt=user_prompt,
                system_prompt=system_prompt,
            )
            data = _extract_json(raw_response)
            parsed = _build_structured_intelligence(
                data=data,
                payload=payload,
                intelligence_id=intelligence_id,
                duration_ms=(time.perf_counter() - t0) * 1000,
            )
            logger.info(
                "InvestigationIntelligenceEngine completed",
                extra={
                    "intelligence_id": intelligence_id,
                    "confidence_score": parsed.confidence_score,
                },
            )
            return parsed

        except Exception as exc:
            logger.warning(
                "InvestigationIntelligenceEngine LLM failed; falling back to deterministic intelligence",
                extra={"error": str(exc), "intelligence_id": intelligence_id},
            )
            return _build_deterministic_intelligence(
                payload=payload,
                intelligence_id=intelligence_id,
                duration_ms=(time.perf_counter() - t0) * 1000,
                reason=f"LLM failure/fallback: {exc}",
            )


class InvestigationFallbackEngine(IInvestigationIntelligenceEngine):
    """
    Deterministic fallback engine for Investigation Intelligence.

    Used when LLM generation fails or is disabled.
    Builds a valid InvestigationIntelligence object entirely from structured input data.
    """

    async def analyze(
        self, payload: InvestigationIntelligenceInput
    ) -> InvestigationIntelligence:
        t0 = time.perf_counter()
        return _build_deterministic_intelligence(
            payload=payload,
            intelligence_id=str(uuid.uuid4()),
            duration_ms=(time.perf_counter() - t0) * 1000,
            reason="fallback engine (LLM disabled/failed)",
        )


def _build_structured_intelligence(
    data: dict[str, Any],
    payload: InvestigationIntelligenceInput,
    intelligence_id: str,
    duration_ms: float,
) -> InvestigationIntelligence:
    """Map an extracted, validated LLM dictionary into an InvestigationIntelligence object."""
    cp = payload.complaint_profile

    # Crime Classification
    cc_raw = data.get("crime_classification", {})
    if not isinstance(cc_raw, dict):
        cc_raw = {}
    crime_classification = CrimeClassification(
        primary_category=str(cc_raw.get("primary_category") or cp.crime_type),
        sub_category=str(cc_raw.get("sub_category") or ""),
        applicable_statutes=[str(s) for s in cc_raw.get("applicable_statutes", []) if s],
        rationale=str(cc_raw.get("rationale") or ""),
    )

    # Complaint Understanding
    complaint_understanding = str(data.get("complaint_understanding") or cp.summary or "")

    # Correlated Entities
    correlated_entities: list[KeyEntitySummary] = []
    for raw_e in data.get("correlated_entities", []):
        if isinstance(raw_e, dict) and raw_e.get("entity_type") and raw_e.get("name_or_value"):
            correlated_entities.append(
                KeyEntitySummary(
                    entity_type=str(raw_e["entity_type"]),
                    name_or_value=str(raw_e["name_or_value"]),
                    role=str(raw_e.get("role") or "unknown"),
                    corroborating_sources=[
                        str(s) for s in raw_e.get("corroborating_sources", []) if s
                    ],
                )
            )

    # Contradictions — combine M11 contradictions with any new LLM-detected ones
    contradictions: list[TimelineContradiction] = list(payload.timeline_intelligence.contradictions)
    for raw_c in data.get("contradictions", []):
        if isinstance(raw_c, dict) and raw_c.get("description"):
            cid = str(raw_c.get("contradiction_id") or f"c_llm_{uuid.uuid4().hex[:6]}")
            if not any(existing.contradiction_id == cid for existing in contradictions):
                contradictions.append(
                    TimelineContradiction(
                        contradiction_id=cid,
                        contradiction_type=str(raw_c.get("contradiction_type") or "cross_evidence"),
                        description=str(raw_c["description"]),
                        severity=raw_c.get("severity") if raw_c.get("severity") in ("low", "medium", "high", "critical") else "medium",
                        conflicting_entries=[str(e) for e in raw_c.get("conflicting_entries", []) if e],
                    )
                )

    # Investigative Gaps — no recommended_source
    investigative_gaps: list[MissingEvidenceGap] = []
    for raw_g in data.get("investigative_gaps", []):
        if isinstance(raw_g, dict) and raw_g.get("description"):
            gid = str(raw_g.get("gap_id") or f"gap_{uuid.uuid4().hex[:6]}")
            raw_conf = float(raw_g.get("confidence", 1.0))
            investigative_gaps.append(
                MissingEvidenceGap(
                    gap_id=gid,
                    description=str(raw_g["description"]),
                    impact=str(raw_g.get("impact") or ""),
                    confidence=max(0.0, min(1.0, raw_conf)),
                )
            )

    # Risk Assessment
    ra_raw = data.get("risk_assessment", {})
    if not isinstance(ra_raw, dict):
        ra_raw = {}
    raw_score = float(ra_raw.get("score", 5.0))
    clamped_score = max(0.0, min(10.0, raw_score))
    raw_level = str(ra_raw.get("level", "MEDIUM")).upper()
    if raw_level not in ("LOW", "MEDIUM", "HIGH", "CRITICAL"):
        raw_level = _score_to_level(clamped_score)

    factors: list[InvestigationRiskFactor] = []
    for raw_f in ra_raw.get("factors", []):
        if isinstance(raw_f, dict) and raw_f.get("factor_name"):
            factors.append(
                InvestigationRiskFactor(
                    factor_name=str(raw_f["factor_name"]),
                    severity=raw_f.get("severity") if raw_f.get("severity") in ("low", "medium", "high", "critical") else "medium",
                    description=str(raw_f.get("description") or ""),
                )
            )

    risk_assessment = InvestigationRiskAssessment(
        score=clamped_score,
        level=raw_level,  # type: ignore
        factors=factors,
    )

    # Confidence
    raw_conf = float(data.get("confidence_score", cp.confidence or 0.8))
    clamped_conf = max(0.0, min(1.0, raw_conf))

    context_id = (
        getattr(payload.timeline_intelligence, "context_id", "") or cp.crime_type
    )

    return InvestigationIntelligence(
        intelligence_id=intelligence_id,
        context_id=context_id,
        crime_classification=crime_classification,
        complaint_understanding=complaint_understanding,
        correlated_entities=correlated_entities,
        contradictions=contradictions,
        investigative_gaps=investigative_gaps,
        risk_assessment=risk_assessment,
        confidence_score=clamped_conf,
        confidence_rationale=str(data.get("confidence_rationale") or "Corroborated across inputs."),
        processing_duration_ms=round(duration_ms, 2),
    )


def _build_deterministic_intelligence(
    payload: InvestigationIntelligenceInput,
    intelligence_id: str,
    duration_ms: float,
    reason: str,
) -> InvestigationIntelligence:
    """
    Build a deterministic InvestigationIntelligence from structured inputs.
    Used by InvestigationFallbackEngine and on LLM error.
    No hallucination risk — only derives facts from provided inputs.
    """
    logger.info(
        "InvestigationIntelligenceEngine: building deterministic intelligence",
        extra={"reason": reason, "intelligence_id": intelligence_id},
    )

    cp = payload.complaint_profile

    # Crime Classification
    crime_classification = CrimeClassification(
        primary_category=cp.crime_type,
        sub_category="",
        applicable_statutes=[],
        rationale=f"Derived directly from complaint crime_type: {cp.crime_type}.",
    )

    # Complaint Understanding
    ev_count = len(payload.evidence_profiles)
    complaint_understanding = (
        f"Complaint type: {cp.crime_type}. {cp.summary} "
        f"Supported by {ev_count} evidence profile(s) and M11 timeline intelligence."
    )

    # Correlated Entities — derived from complaint fields and evidence
    correlated_entities: list[KeyEntitySummary] = []
    for s in getattr(cp, "suspects", []):
        name = getattr(s, "name", None) or getattr(s, "description", None) or "Unknown Suspect"
        correlated_entities.append(
            KeyEntitySummary(
                entity_type="person",
                name_or_value=str(name),
                role="suspect",
                corroborating_sources=["complaint"],
            )
        )
    for v in getattr(cp, "victims", []):
        name = getattr(v, "name", None) or getattr(v, "description", None) or "Victim"
        correlated_entities.append(
            KeyEntitySummary(
                entity_type="person",
                name_or_value=str(name),
                role="victim",
                corroborating_sources=["complaint"],
            )
        )
    for loc in getattr(cp, "locations", []):
        correlated_entities.append(
            KeyEntitySummary(
                entity_type="location",
                name_or_value=str(loc),
                role="location",
                corroborating_sources=["complaint"],
            )
        )
    for ev in payload.evidence_profiles:
        for ent in getattr(ev, "extracted_entities", []):
            correlated_entities.append(
                KeyEntitySummary(
                    entity_type=getattr(ent, "entity_type", "entity"),
                    name_or_value=getattr(ent, "value", str(ent)),
                    role="evidence_extracted",
                    corroborating_sources=[ev.evidence_id],
                )
            )

    # Contradictions from M11
    contradictions = list(payload.timeline_intelligence.contradictions)

    # Investigative Gaps — from complaint missing_information and M11 highlights
    investigative_gaps: list[MissingEvidenceGap] = []
    for idx, mi in enumerate(cp.missing_information, start=1):
        investigative_gaps.append(
            MissingEvidenceGap(
                gap_id=f"gap_complaint_{idx}",
                description=mi,
                impact="Missing detail noted in complaint profile.",
                confidence=1.0,
            )
        )
    for idx, highlight in enumerate(payload.timeline_intelligence.missing_timestamp_highlights, start=1):
        investigative_gaps.append(
            MissingEvidenceGap(
                gap_id=f"gap_timestamp_{idx}",
                description=f"Unparsed timestamp on event '{highlight.event_id}': {highlight.description}",
                impact=highlight.impact,
                confidence=1.0,
            )
        )

    # Risk Assessment
    prio = cp.priority.lower()
    if prio == "critical":
        base_score, level = 9.0, "CRITICAL"
    elif prio == "high":
        base_score, level = 7.5, "HIGH"
    elif prio == "medium":
        base_score, level = 5.0, "MEDIUM"
    else:
        base_score, level = 2.5, "LOW"

    risk_factors = [
        InvestigationRiskFactor(
            factor_name=f"Complaint Priority ({cp.priority})",
            severity="high" if prio in ("high", "critical") else "medium",
            description=f"Complaint priority is classified as {cp.priority}.",
        )
    ]
    if contradictions:
        risk_factors.append(
            InvestigationRiskFactor(
                factor_name="Contradictions Detected",
                severity="high",
                description=f"{len(contradictions)} contradiction(s) identified across complaint/evidence.",
            )
        )

    risk_assessment = InvestigationRiskAssessment(
        score=base_score,
        level=level,  # type: ignore
        factors=risk_factors,
    )

    context_id = (
        getattr(payload.timeline_intelligence, "context_id", "") or cp.crime_type
    )

    return InvestigationIntelligence(
        intelligence_id=intelligence_id,
        context_id=context_id,
        crime_classification=crime_classification,
        complaint_understanding=complaint_understanding,
        correlated_entities=correlated_entities,
        contradictions=contradictions,
        investigative_gaps=investigative_gaps,
        risk_assessment=risk_assessment,
        confidence_score=cp.confidence or 0.75,
        confidence_rationale="Deterministic baseline from complaint confidence.",
        processing_duration_ms=round(duration_ms, 2),
    )


def _extract_json(raw_text: str) -> dict[str, Any]:
    """Extract and parse a JSON object from raw LLM output."""
    text = raw_text.strip()

    match = _JSON_BLOCK_RE.search(text)
    if match:
        text = match.group(1).strip()
    elif text.startswith("```"):
        lines = text.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError as exc:
        logger.warning(
            "Failed to parse LLM JSON directly",
            extra={"error": str(exc), "snippet": text[:200]},
        )

    start_idx = text.find("{")
    end_idx = text.rfind("}")
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        data = json.loads(text[start_idx: end_idx + 1])
        if isinstance(data, dict):
            return data

    raise ValueError(f"Could not parse valid JSON from LLM response: {raw_text[:200]}")


def _score_to_level(score: float) -> str:
    if score >= 8.5:
        return "CRITICAL"
    if score >= 6.5:
        return "HIGH"
    if score >= 3.5:
        return "MEDIUM"
    return "LOW"
