from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from typing import Any, Iterable, Sequence

from .models import (
    ApplicableSection,
    ConfidenceSummary,
    LegalAnalysisResult,
    LegalRetrievalBundle,
    LegalRetrievalResult,
    MatchedElement,
    ReasoningClaim,
    SectionExplanation,
    SupportingSection,
)
from llm.qwen_client import QwenClient


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _sigmoid(value: float) -> float:
    return 1.0 / (1.0 + math.exp(-value))


def _normalize_signal(value: float) -> float:
    if 0.0 <= value <= 1.0:
        return _clamp(value)
    return _clamp(_sigmoid(value))


def _confidence_level(score: float) -> str:
    if score >= 0.76:
        return "HIGH"
    if score >= 0.50:
        return "MEDIUM"
    return "LOW"


def compute_confidence(bundle: LegalRetrievalBundle) -> ConfidenceSummary:
    candidates = bundle.top_5 or bundle.top_20
    if not candidates:
        return ConfidenceSummary(score=0.0, level="LOW")

    top = candidates[0]
    vector_signal = _normalize_signal(top.retrieval_score)
    rerank_signal = _normalize_signal(top.rerank_score)

    if len(candidates) > 1:
        runner_up = candidates[1]
        margin_signal = _normalize_signal(max(top.rerank_score - runner_up.rerank_score, 0.0))
    else:
        margin_signal = 1.0

    rerank_total = sum(max(item.rerank_score, 0.0) for item in candidates)
    dominance_signal = _clamp(top.rerank_score / rerank_total) if rerank_total else 0.0

    act_agreement = sum(1 for item in candidates if item.record.act == top.record.act) / len(candidates)
    chapter_agreement = (
        sum(1 for item in candidates if item.record.chapter and item.record.chapter == top.record.chapter) / len(candidates)
        if top.record.chapter
        else 0.0
    )
    agreement_signal = (0.6 * act_agreement) + (0.4 * chapter_agreement)

    score = (
        0.30 * vector_signal
        + 0.30 * rerank_signal
        + 0.15 * margin_signal
        + 0.15 * dominance_signal
        + 0.10 * agreement_signal
    )
    score = round(_clamp(score), 2)
    return ConfidenceSummary(score=score, level=_confidence_level(score))


def _allowed_section_keys(bundle: LegalRetrievalBundle) -> set[str]:
    return {section.section_key for section in [*bundle.top_5, *bundle.context_sections, *bundle.top_20]}


def _default_act(bundle: LegalRetrievalBundle) -> str | None:
    acts = {section.record.act for section in [*bundle.top_5, *bundle.context_sections, *bundle.top_20] if section.record.act}
    if len(acts) == 1:
        return next(iter(acts))
    return None


def _lookup_section(bundle: LegalRetrievalBundle, section_key: str) -> LegalRetrievalResult | None:
    for result in [*bundle.top_5, *bundle.context_sections, *bundle.top_20]:
        if result.section_key == section_key:
            return result
    return None


def _parse_section_key(raw: str, default_act: str | None = None) -> str:
    cleaned = str(raw).strip()
    if not cleaned:
        return cleaned
    if "_" in cleaned:
        return cleaned
    if default_act:
        return f"{default_act}_{cleaned}"
    return cleaned


def _extract_json(text: str) -> dict[str, Any]:
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


def _sanitize_applicable_sections(bundle: LegalRetrievalBundle, raw_items: Any) -> list[ApplicableSection]:
    selected: dict[str, ApplicableSection] = {}
    canonical = {item.section_key: item for item in bundle.top_5}
    default_act = _default_act(bundle)
    if isinstance(raw_items, list):
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            section = _parse_section_key(item.get("section") or item.get("section_number") or "", item.get("act") or default_act)
            result = canonical.get(section) or _lookup_section(bundle, section)
            if result is None:
                continue
            selected[result.section_key] = ApplicableSection(
                act=result.record.act,
                section=result.record.serial_number,
                relevance_score=round(_clamp(_normalize_signal(result.rerank_score)), 3),
            )
    if not selected:
        for result in bundle.top_5:
            selected[result.section_key] = ApplicableSection(
                act=result.record.act,
                section=result.record.serial_number,
                relevance_score=round(_clamp(_normalize_signal(result.rerank_score)), 3),
            )
    return list(selected.values())


def _sanitize_explanations(bundle: LegalRetrievalBundle, raw_items: Any) -> list[SectionExplanation]:
    allowed = _allowed_section_keys(bundle)
    default_act = _default_act(bundle)
    explanations: list[SectionExplanation] = []
    if isinstance(raw_items, list):
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            section = _parse_section_key(item.get("section") or item.get("section_number") or "", default_act)
            if section not in allowed:
                continue
            raw_elements = item.get("matched_elements", [])
            matched_elements: list[MatchedElement] = []
            if isinstance(raw_elements, list):
                for element in raw_elements:
                    if not isinstance(element, dict):
                        continue
                    legal_element = str(element.get("legal_element") or "").strip()
                    complaint_fact = str(element.get("complaint_fact") or "").strip()
                    if legal_element and complaint_fact:
                        matched_elements.append(MatchedElement(legal_element=legal_element, complaint_fact=complaint_fact))
            if matched_elements:
                explanations.append(SectionExplanation(section=section, matched_elements=matched_elements))
    if explanations:
        return explanations

    fallback: list[SectionExplanation] = []
    for result in bundle.top_5:
        fallback.append(
            SectionExplanation(
                section=result.section_key,
                matched_elements=[
                    MatchedElement(
                        legal_element="retrieval relevance",
                        complaint_fact="Complaint was matched to this section in vector search and reranking.",
                    )
                ],
            )
        )
    return fallback


def _sanitize_reasoning(bundle: LegalRetrievalBundle, raw_items: Any, explanation: list[SectionExplanation]) -> list[ReasoningClaim]:
    allowed = _allowed_section_keys(bundle)
    default_act = _default_act(bundle)
    claims: list[ReasoningClaim] = []
    if isinstance(raw_items, list):
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            claim = str(item.get("claim") or "").strip()
            citations_raw = item.get("citations", [])
            citations: list[str] = []
            if isinstance(citations_raw, list):
                for citation in citations_raw:
                    key = _parse_section_key(str(citation), default_act)
                    if key in allowed and key not in citations:
                        citations.append(key)
            if claim and citations:
                claims.append(ReasoningClaim(claim=claim, citations=citations))
    return claims


def _sanitize_supporting_sections(bundle: LegalRetrievalBundle) -> list[SupportingSection]:
    supporting: list[SupportingSection] = []
    for result in bundle.context_sections:
        supporting.append(SupportingSection(section=result.section_key, context_type=result.context_type))
    return supporting


def build_analysis_result(bundle: LegalRetrievalBundle, raw_output: dict[str, Any]) -> LegalAnalysisResult:
    confidence = compute_confidence(bundle)
    explanation = _sanitize_explanations(bundle, raw_output.get("explanation"))
    reasoning = _sanitize_reasoning(bundle, raw_output.get("reasoning"), explanation)
    supporting_sections = _sanitize_supporting_sections(bundle)
    applicable_sections = _sanitize_applicable_sections(bundle, raw_output.get("applicable_sections"))

    result = LegalAnalysisResult(
        query=str(raw_output.get("query") or bundle.complaint),
        confidence=confidence,
        applicable_sections=applicable_sections,
        explanation=explanation,
        reasoning=reasoning,
        supporting_sections=supporting_sections,
        review_note="Manual legal review recommended." if confidence.level == "LOW" else None,
    )
    return result


@dataclass(slots=True)
class LegalAnalysisService:
    llm_client: QwenClient

    def analyze(self, bundle: LegalRetrievalBundle) -> LegalAnalysisResult:
        raw_output = self.llm_client.generate_structured_analysis(
            complaint=bundle.complaint,
            sections=bundle.prompt_sections_text(),
        )
        return build_analysis_result(bundle, raw_output)
