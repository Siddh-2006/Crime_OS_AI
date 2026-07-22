"""
Milestone 11 — Timeline Intelligence Engine.

TimelineIntelligenceEngine
    - Sends complaint, timeline (M10), and evidence refs to the LLM via ILLMClient.
    - Applies strict anti-hallucination prompting (see prompt.py).
    - Parses structured JSON from the LLM response.
    - Falls back gracefully if LLM is unavailable or returns invalid JSON —
      the deterministic timeline passes through untouched.

TimelineFallbackEngine
    - Pure-Python fallback that produces a TimelineIntelligence with empty
      analysis sections and a passthrough summary.  Used in tests or when
      LLM is disabled via TIMELINE_INTELLIGENCE_ENABLED=false.
"""
from __future__ import annotations

import json
import re
import time
import uuid

from app.core.exceptions import LLMError
from app.core.logging import logger
from app.llm.client import ILLMClient
from app.schemas.timeline import TimestampPrecision
from app.schemas.timeline_intelligence import (
    CausalRelationship,
    MissingTimestampHighlight,
    RefinedTimelineEntry,
    TimelineContradiction,
    TimelineIntelligence,
    TimelineIntelligenceInput,
)
from app.timeline_intelligence.interfaces import ITimelineIntelligenceEngine
from app.timeline_intelligence.prompt import SYSTEM_PROMPT, build_user_prompt


# ────────────────────────────────────────────────────────────────────────────
# JSON extraction helper
# ────────────────────────────────────────────────────────────────────────────

_JSON_RE = re.compile(r"\{.*\}", re.DOTALL)


def _extract_json(text: str) -> dict:
    """
    Extract and parse the first JSON object found in the LLM output string.
    Raises ValueError if no valid JSON object is found.
    """
    match = _JSON_RE.search(text)
    if not match:
        raise ValueError("No JSON object found in LLM response")
    return json.loads(match.group())


# ────────────────────────────────────────────────────────────────────────────
# Main engine
# ────────────────────────────────────────────────────────────────────────────

class TimelineIntelligenceEngine(ITimelineIntelligenceEngine):
    """
    LLM-powered Timeline Intelligence Engine.

    Depends only on ILLMClient — fully model-agnostic.  The concrete LLM
    (e.g. gemma4:e2b via OllamaLLMClient) is injected at startup by the DI
    container.
    """

    def __init__(self, llm_client: ILLMClient) -> None:
        self._llm = llm_client

    async def analyze(self, payload: TimelineIntelligenceInput) -> TimelineIntelligence:
        t0 = time.perf_counter()
        intelligence_id = str(uuid.uuid4())
        timeline_id = payload.timeline.timeline_id

        user_prompt = build_user_prompt(payload)

        try:
            raw = await self._llm.generate(
                prompt=user_prompt,
                system_prompt=SYSTEM_PROMPT,
            )
        except LLMError as exc:
            logger.warning(
                "TimelineIntelligenceEngine: LLM call failed, falling back to passthrough",
                extra={"error": str(exc), "timeline_id": timeline_id},
            )
            return _passthrough_intelligence(
                payload=payload,
                intelligence_id=intelligence_id,
                duration_ms=(time.perf_counter() - t0) * 1000,
                reason=str(exc),
            )

        try:
            data = _extract_json(raw)
        except (ValueError, json.JSONDecodeError) as exc:
            logger.warning(
                "TimelineIntelligenceEngine: LLM response is not valid JSON, falling back",
                extra={"error": str(exc), "timeline_id": timeline_id, "raw_snippet": raw[:200]},
            )
            return _passthrough_intelligence(
                payload=payload,
                intelligence_id=intelligence_id,
                duration_ms=(time.perf_counter() - t0) * 1000,
                reason="LLM returned non-JSON output",
            )

        # ── Parse refined entries ──────────────────────────────────────────
        refined_entries: list[RefinedTimelineEntry] = []
        for raw_entry in data.get("refined_entries", []):
            try:
                refined_entries.append(RefinedTimelineEntry.model_validate(raw_entry))
            except Exception as exc:  # noqa: BLE001
                logger.debug(
                    "Skipping malformed refined_entry",
                    extra={"error": str(exc), "entry": raw_entry},
                )

        # If LLM returned no refined entries, fall back to passthrough entries
        if not refined_entries:
            refined_entries = _passthrough_refined_entries(payload)

        # ── Parse contradictions ───────────────────────────────────────────
        contradictions: list[TimelineContradiction] = []
        for raw_c in data.get("contradictions", []):
            try:
                contradictions.append(TimelineContradiction.model_validate(raw_c))
            except Exception as exc:  # noqa: BLE001
                logger.debug("Skipping malformed contradiction", extra={"error": str(exc)})

        # ── Parse causal relationships ─────────────────────────────────────
        causal_relationships: list[CausalRelationship] = []
        for raw_l in data.get("causal_relationships", []):
            try:
                causal_relationships.append(CausalRelationship.model_validate(raw_l))
            except Exception as exc:  # noqa: BLE001
                logger.debug("Skipping malformed causal_relationship", extra={"error": str(exc)})

        # ── Parse missing timestamp highlights ────────────────────────────
        missing_highlights: list[MissingTimestampHighlight] = []
        for raw_m in data.get("missing_timestamp_highlights", []):
            try:
                missing_highlights.append(MissingTimestampHighlight.model_validate(raw_m))
            except Exception as exc:  # noqa: BLE001
                logger.debug("Skipping malformed missing_timestamp", extra={"error": str(exc)})

        # Always derive missing highlights from unparsed entries — LLM may miss
        # entries flagged by M10.  Merge without duplicating.
        llm_flagged_ids = {h.event_id for h in missing_highlights}
        for entry in payload.timeline.entries:
            if (
                entry.parsed_time.precision == TimestampPrecision.UNPARSED
                and entry.event_id not in llm_flagged_ids
            ):
                missing_highlights.append(
                    MissingTimestampHighlight(
                        event_id=entry.event_id,
                        description=entry.description,
                        impact="Missing timestamp reduces chronological certainty.",
                        suggested_window=None,
                    )
                )

        summary: str = data.get("summary", "")
        if not summary:
            summary = _default_summary(payload)

        duration_ms = (time.perf_counter() - t0) * 1000

        logger.info(
            "TimelineIntelligenceEngine: analysis complete",
            extra={
                "intelligence_id": intelligence_id,
                "timeline_id": timeline_id,
                "refined_entries": len(refined_entries),
                "contradictions": len(contradictions),
                "causal_links": len(causal_relationships),
                "missing_timestamps": len(missing_highlights),
                "duration_ms": round(duration_ms, 2),
            },
        )

        return TimelineIntelligence(
            intelligence_id=intelligence_id,
            timeline_id=timeline_id,
            summary=summary,
            refined_entries=refined_entries,
            contradictions=contradictions,
            causal_relationships=causal_relationships,
            missing_timestamp_highlights=missing_highlights,
            processing_duration_ms=round(duration_ms, 2),
        )


# ────────────────────────────────────────────────────────────────────────────
# Fallback engine (LLM-free)
# ────────────────────────────────────────────────────────────────────────────

class TimelineFallbackEngine(ITimelineIntelligenceEngine):
    """
    Pure-Python fallback engine.  Produces a passthrough TimelineIntelligence
    with no LLM refinement.  Used when LLM is disabled or unavailable.
    """

    async def analyze(self, payload: TimelineIntelligenceInput) -> TimelineIntelligence:
        t0 = time.perf_counter()
        return _passthrough_intelligence(
            payload=payload,
            intelligence_id=str(uuid.uuid4()),
            duration_ms=(time.perf_counter() - t0) * 1000,
            reason="fallback engine (LLM disabled)",
        )


# ────────────────────────────────────────────────────────────────────────────
# Shared helpers
# ────────────────────────────────────────────────────────────────────────────

def _passthrough_refined_entries(payload: TimelineIntelligenceInput) -> list[RefinedTimelineEntry]:
    """Convert deterministic timeline entries to passthrough RefinedTimelineEntry objects."""
    result = []
    for entry in payload.timeline.entries:
        result.append(
            RefinedTimelineEntry(
                entry_id=entry.entry_id,
                event_id=entry.event_id,
                original_description=entry.description,
                refined_description=entry.description,  # no refinement
                resolved_actors=list(entry.actors),
                action=entry.action,
                parsed_time=entry.parsed_time,
                location=entry.location,
                sources=list(entry.sources),
            )
        )
    return result


def _default_summary(payload: TimelineIntelligenceInput) -> str:
    """Generate a minimal summary from the timeline metadata."""
    tl = payload.timeline
    cp = payload.complaint_profile
    parts = [
        f"Investigation timeline for {cp.crime_type} complaint (context: {tl.context_id}).",
        f"Total events: {tl.total_events}.",
    ]
    if tl.start_time and tl.end_time:
        parts.append(f"Period: {tl.start_time} to {tl.end_time}.")
    if tl.unparsed_count:
        parts.append(f"{tl.unparsed_count} event(s) have missing or unparseable timestamps.")
    return " ".join(parts)


def _passthrough_intelligence(
    payload: TimelineIntelligenceInput,
    intelligence_id: str,
    duration_ms: float,
    reason: str,
) -> TimelineIntelligence:
    """Build a passthrough TimelineIntelligence (no LLM analysis)."""
    logger.info(
        "TimelineIntelligenceEngine: passthrough mode",
        extra={"reason": reason, "intelligence_id": intelligence_id},
    )
    missing_highlights: list[MissingTimestampHighlight] = []
    for entry in payload.timeline.entries:
        if entry.parsed_time.precision == TimestampPrecision.UNPARSED:
            missing_highlights.append(
                MissingTimestampHighlight(
                    event_id=entry.event_id,
                    description=entry.description,
                    impact="Missing timestamp reduces chronological certainty.",
                    suggested_window=None,
                )
            )
    return TimelineIntelligence(
        intelligence_id=intelligence_id,
        timeline_id=payload.timeline.timeline_id,
        summary=_default_summary(payload),
        refined_entries=_passthrough_refined_entries(payload),
        contradictions=[],
        causal_relationships=[],
        missing_timestamp_highlights=missing_highlights,
        processing_duration_ms=round(duration_ms, 2),
    )
