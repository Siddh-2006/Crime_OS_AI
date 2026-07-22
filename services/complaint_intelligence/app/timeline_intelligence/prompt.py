"""
Prompt builder for Milestone 11 — Timeline Intelligence.

Builds the system prompt (strict anti-hallucination instructions) and the
user/task prompt (structured evidence payload) that are sent to the LLM via
ILLMClient.generate().

Anti-hallucination guarantee:
    - The system prompt explicitly forbids the LLM from inventing any person,
      place, timestamp, evidence item, or event.
    - The system prompt prohibits adding information not present in the provided
      input.
    - The user prompt contains ONLY the Complaint Profile, Deterministic
      Timeline (M10), and Evidence References.
    - The expected JSON response schema is embedded in the system prompt so the
      LLM can produce structured output without reasoning beyond the evidence.
"""
from __future__ import annotations

import json

from app.schemas.timeline_intelligence import TimelineIntelligenceInput

# ────────────────────────────────────────────────────────────────────────────
# SYSTEM PROMPT (anti-hallucination + structured output contract)
# ────────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a forensic timeline analyst. Your ONLY job is to reason
over the EXACT evidence provided to you and produce a structured JSON report.

╔══════════════════════════════════════════════════════════════════════════════╗
║                    STRICT ANTI-HALLUCINATION RULES                          ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  1. You MUST NOT invent any person, place, timestamp, evidence item, or      ║
║     event that is not explicitly present in the input data.                 ║
║  2. You MUST NOT add information not present in the provided input.          ║
║  3. You MUST NOT guess, speculate, or extrapolate beyond the given evidence. ║
║  4. If information is insufficient to answer, you MUST explicitly state      ║
║     "Insufficient evidence" and leave the field empty rather than guessing.  ║
║  5. You MUST NOT modify timestamps — only reformat or flag them.            ║
║  6. You MUST NOT merge events unless they are semantically identical based   ║
║     solely on the provided text (exact duplicates are already removed).     ║
╚══════════════════════════════════════════════════════════════════════════════╝

PERMITTED OPERATIONS (limited to reasoning over the provided evidence):
  • Improve the wording and readability of event descriptions (no new facts).
  • Resolve pronoun references (he/she/they/the accused/the victim) using names
    already present in the input. If a pronoun cannot be resolved, leave it.
  • Detect contradictions between the complaint profile and evidence.
  • Infer POSSIBLE causal relationships between events — clearly mark as inferred
    and only if strongly supported by the provided timeline sequence.
  • Highlight events where a timestamp is missing, vague, or unparseable.
  • Generate a coherent chronological narrative from the provided events ONLY.

OUTPUT FORMAT — Return ONLY valid JSON. Do NOT include any prose, markdown
fences, or explanatory text outside the JSON object. The schema is:

{
  "summary": "<string: coherent narrative using ONLY provided events>",
  "refined_entries": [
    {
      "entry_id": "<string: copy from input>",
      "event_id": "<string: copy from input>",
      "original_description": "<string: copy from input>",
      "refined_description": "<string: improved wording, no new facts>",
      "resolved_actors": ["<string: resolved actor names>"],
      "action": "<string: copy from input>",
      "parsed_time": <object: copy verbatim from input entry.parsed_time>,
      "location": "<string or null: copy from input>",
      "sources": ["<string: copy from input>"]
    }
  ],
  "contradictions": [
    {
      "contradiction_id": "<string: 'C-' + sequential number>",
      "contradiction_type": "<timestamp_mismatch|fact_conflict|actor_discrepancy>",
      "description": "<string: plain-language explanation>",
      "conflicting_event_ids": ["<string: event_id>"],
      "severity": "<low|medium|high|critical>"
    }
  ],
  "causal_relationships": [
    {
      "link_id": "<string: 'L-' + sequential number>",
      "cause_event_id": "<string>",
      "effect_event_id": "<string>",
      "reasoning": "<string: evidence-backed explanation>"
    }
  ],
  "missing_timestamp_highlights": [
    {
      "event_id": "<string>",
      "description": "<string: copy from input>",
      "impact": "<string: investigation impact>",
      "suggested_window": "<string or null: only if adjacent events bound a window>"
    }
  ]
}

If any section has no items, return an empty array [].
Do NOT output anything other than the JSON object above.
"""

# ────────────────────────────────────────────────────────────────────────────
# USER / TASK PROMPT builder
# ────────────────────────────────────────────────────────────────────────────

def build_user_prompt(payload: TimelineIntelligenceInput) -> str:
    """
    Serialize the TimelineIntelligenceInput into a structured prompt.

    Only data from the payload is included — no external facts are injected.
    """
    cp = payload.complaint_profile
    tl = payload.timeline

    # Complaint block — includes only fields from ComplaintProfile schema
    complaint_block = {
        "crime_type": cp.crime_type,
        "priority": cp.priority,
        "summary": cp.summary,
        "missing_information": cp.missing_information,
        "recommendations": cp.recommendations,
        "confidence": cp.confidence,
    }

    # Timeline entries block
    timeline_entries = []
    for entry in tl.entries:
        timeline_entries.append({
            "entry_id": entry.entry_id,
            "event_id": entry.event_id,
            "description": entry.description,
            "actors": entry.actors,
            "action": entry.action,
            "raw_timestamp": entry.raw_timestamp,
            "parsed_time": entry.parsed_time.model_dump(mode="json"),
            "location": entry.location,
            "sources": entry.sources,
            "confidence": entry.confidence,
        })

    timeline_block = {
        "timeline_id": tl.timeline_id,
        "context_id": tl.context_id,
        "total_events": tl.total_events,
        "unparsed_count": tl.unparsed_count,
        "start_time": tl.start_time,
        "end_time": tl.end_time,
        "entries": timeline_entries,
    }

    # Evidence references block
    evidence_block = [
        ref.model_dump(mode="json") for ref in payload.evidence_references
    ]

    task_data = {
        "complaint_profile": complaint_block,
        "deterministic_timeline": timeline_block,
        "evidence_references": evidence_block,
    }

    return (
        "Analyze the following forensic investigation data and produce the JSON "
        "report described in your instructions.\n\n"
        "INPUT DATA:\n"
        + json.dumps(task_data, indent=2, ensure_ascii=False, default=str)
    )
