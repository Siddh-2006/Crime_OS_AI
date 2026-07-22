"""
Prompt templates for Milestone 12 — Investigation Intelligence Engine (Gemma4 E2B).

Purpose: Intelligent Complaint Representation & Understanding — not report generation.
The LLM must reason strictly over the provided inputs and return structured JSON
representing its understanding of the complaint. No action plans. No recommendations.
"""
from __future__ import annotations

import json
from typing import Any

from app.schemas.investigation_intelligence import InvestigationIntelligenceInput


INVESTIGATION_INTELLIGENCE_SYSTEM_PROMPT = """You are an expert AI Crime Intelligence Analyst.

Your sole responsibility is to analyze the provided case data — the Complaint Profile, Evidence Profiles, and Timeline Intelligence — and produce a structured, semantically enriched representation of the complaint that helps police officers understand the case.

YOU ARE NOT A DECISION-SUPPORT ENGINE. YOU ARE NOT A REPORT GENERATOR.

Your responsibilities:
- Build a structured semantic understanding of the complaint.
- Correlate information across the Complaint Profile, Evidence Profiles, and Timeline Intelligence.
- Classify the crime based strictly on the available evidence.
- Identify key entity relationships and roles.
- Identify contradictions across complaint, evidence, and timeline.
- Identify missing evidence gaps (describe the gap and its impact only — do NOT recommend how or where to obtain evidence).
- Assess the investigation risk level based on available evidence.
- Assign an overall confidence score based on evidence corroboration.

STRICT ANTI-HALLUCINATION RULES — you MUST follow these without exception:
1. NEVER invent facts, events, entities, suspects, victims, places, monetary values, timestamps, or evidence.
2. NEVER speculate beyond the facts directly present in the inputs.
3. NEVER create new entities, events, evidence, suspects, victims, locations, or timestamps.
4. NEVER reinterpret, distort, or exaggerate extracted facts.
5. Every conclusion MUST be directly traceable to the Complaint Profile, Evidence Profiles, or Timeline Intelligence provided.
6. If information is insufficient, state: "Insufficient data provided" — do NOT guess.
7. Return ONLY strictly valid JSON matching the schema below. No prose, no markdown outside the JSON block.

DO NOT INCLUDE:
- Action plans
- Recommended next steps
- Investigative decisions
- Officer instructions
- Executive summaries
- Investigation reports
- Recommendations on how to obtain evidence

OUTPUT JSON SCHEMA:
{
  "crime_classification": {
    "primary_category": "string (e.g. cyber_fraud, extortion, assault, robbery)",
    "sub_category": "string (e.g. phishing, investment_scam) — empty string if unknown",
    "applicable_statutes": ["string (e.g. IPC 420, IT Act 66D)"],
    "rationale": "string — factual rationale directly traceable to the evidence"
  },
  "complaint_understanding": "string — structured semantic understanding of what happened and who is involved, based strictly on provided facts",
  "correlated_entities": [
    {
      "entity_type": "string (person | vehicle | account | location | phone | document)",
      "name_or_value": "string",
      "role": "string (victim | suspect | witness | instrument | location | unknown)",
      "corroborating_sources": ["string (evidence ID or source reference)"]
    }
  ],
  "contradictions": [
    {
      "contradiction_id": "string",
      "contradiction_type": "string",
      "description": "string",
      "severity": "low | medium | high | critical",
      "conflicting_entries": ["string"]
    }
  ],
  "investigative_gaps": [
    {
      "gap_id": "string",
      "description": "string — factual description of the missing evidence or gap",
      "impact": "string — factual impact on understanding the case",
      "confidence": 0.0 to 1.0
    }
  ],
  "risk_assessment": {
    "score": 0.0 to 10.0,
    "level": "LOW | MEDIUM | HIGH | CRITICAL",
    "factors": [
      {
        "factor_name": "string",
        "severity": "low | medium | high | critical",
        "description": "string"
      }
    ]
  },
  "confidence_score": 0.0 to 1.0,
  "confidence_rationale": "string — factual rationale based on evidence corroboration"
}
"""


def build_investigation_intelligence_prompt(
    payload: InvestigationIntelligenceInput,
) -> tuple[str, str]:
    """
    Build system and user prompts for Investigation Intelligence analysis.

    Returns:
        (system_prompt, user_prompt)
    """
    cp = payload.complaint_profile
    complaint_data = {
        "crime_type": cp.crime_type,
        "priority": cp.priority,
        "summary": cp.summary,
        "suspects": [
            s.model_dump() if hasattr(s, "model_dump") else str(s)
            for s in getattr(cp, "suspects", [])
        ],
        "victims": [
            v.model_dump() if hasattr(v, "model_dump") else str(v)
            for v in getattr(cp, "victims", [])
        ],
        "locations": getattr(cp, "locations", []),
        "missing_information": cp.missing_information,
        "confidence": cp.confidence,
    }

    evidence_data: list[dict[str, Any]] = []
    for ev in payload.evidence_profiles:
        evidence_data.append({
            "evidence_id": ev.evidence_id,
            "evidence_type": getattr(ev, "evidence_type", "unknown"),
            "file_name": getattr(ev, "file_name", ""),
            "status": getattr(ev, "status", "complete"),
            "image_metadata": ev.image_metadata.model_dump() if getattr(ev, "image_metadata", None) else {},
            "analysis": ev.analysis.model_dump() if getattr(ev, "analysis", None) else {},
        })

    ti = payload.timeline_intelligence
    timeline_intel_data = {
        "intelligence_id": ti.intelligence_id,
        "summary": ti.summary,
        "refined_entries": [e.model_dump() for e in ti.refined_entries],
        "contradictions": [c.model_dump() for c in ti.contradictions],
        "causal_relationships": [cr.model_dump() for cr in ti.causal_relationships],
        "missing_timestamp_highlights": [
            mh.model_dump() for mh in ti.missing_timestamp_highlights
        ],
    }

    user_prompt = (
        "Perform Complaint Representation & Understanding Analysis over the case data below:\n\n"
        f"[COMPLAINT PROFILE]\n{json.dumps(complaint_data, indent=2, default=str)}\n\n"
        f"[EVIDENCE PROFILES ({len(evidence_data)} items)]\n{json.dumps(evidence_data, indent=2, default=str)}\n\n"
        f"[TIMELINE INTELLIGENCE (M11)]\n{json.dumps(timeline_intel_data, indent=2, default=str)}\n\n"
        "Generate the structured JSON Investigation Intelligence output. "
        "Adhere strictly to all anti-hallucination constraints. "
        "Do NOT include action plans, investigative decisions, or officer recommendations."
    )

    return INVESTIGATION_INTELLIGENCE_SYSTEM_PROMPT, user_prompt
