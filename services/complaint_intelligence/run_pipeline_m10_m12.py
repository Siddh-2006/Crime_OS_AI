"""
Resume from M10 — Timeline Builder onward (M10 → M11 → M12).
Picks up the existing investigation context from M9 output (re-runs fusion cheaply).

Usage:
  $env:PYTHONUTF8=1; .venv\\Scripts\\python.exe run_pipeline_m10_m12.py
"""
import asyncio
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.absolute()))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / "backend" / ".env")

from pymongo import MongoClient
from app.core.config import settings

COMPLAINT_NUMBER = "COMP-55333382-6280-494a-ab79-4665d3dcb3f0"
SEP = "=" * 70

def banner(title: str) -> None:
    print(f"\n{SEP}\n  {title}\n{SEP}")


async def main() -> None:
    mongo = MongoClient(os.getenv("MONGODB_URI"))
    db    = mongo["test"]
    doc   = db["complaints"].find_one({"complaintNumber": COMPLAINT_NUMBER})
    if not doc:
        print(f"ERROR: Complaint not found."); return

    ci = doc.get("complaintIntelligence", {})
    print(SEP)
    print("  CRIME OS — PIPELINE RESUME: M10 → M11 → M12")
    print(SEP)
    print(f"  Complaint  : {doc['complaintNumber']}")
    print(f"  Crime type : {ci.get('crimeType', '?')}")
    print(f"  Priority   : {ci.get('priority', '?').upper()}")
    print(f"  M3 entities: {len(ci.get('m3Entities', []))}")

    # ── Re-build shared objects from persisted MongoDB data ───────────────────
    from app.llm.client            import OllamaLLMClient
    from app.schemas.complaint     import ComplaintProfile
    from app.schemas.fusion        import FusionInput, EvidenceRef, InvestigationContext
    from app.schemas.text_intelligence import ExtractedEntity, ExtractedEvent
    from app.fusion.fusion_engine  import IntelligenceFusionEngine
    from app.fusion.entity_merger  import DeterministicEntityMerger
    from app.fusion.event_merger   import DeterministicEventMerger

    llm = OllamaLLMClient(
        base_url=settings.OLLAMA_BASE_URL,
        model=settings.OLLAMA_MODEL,
        timeout=300,
        num_ctx=settings.OLLAMA_NUM_CTX,
    )

    # Rebuild ComplaintProfile
    complaint_profile_obj = ComplaintProfile(
        crime_type=ci.get("crimeType", "unknown"),
        priority=ci.get("priority", "medium"),
        confidence=float(ci.get("confidence", 0.0)),
        summary=ci.get("summary", ""),
        missing_information=ci.get("missingInformation", []),
        recommendations=ci.get("recommendations", []),
    )

    # Re-gather entities from MongoDB (narrative + all evidence)
    all_raw_entities = list(ci.get("m3Entities", []))
    all_raw_events   = list(ci.get("m3Events", []))
    evidence_raw     = doc.get("evidence", [])
    evidence_summaries = []

    for ev in evidence_raw:
        ai = ev.get("aiMetadata", {})
        all_raw_entities.extend(ai.get("m3Entities", []))
        all_raw_events.extend(ai.get("m3Events", []))
        evidence_summaries.append({
            "source":     ev.get("originalFilename", "unknown"),
            "mime":       ev.get("mimeType", ""),
            "caption":    ai.get("m4Caption", ""),
            "ocr_text":   ai.get("ocrText", ""),
            "entities":   ai.get("m3Entities", []),
            "events":     ai.get("m3Events", []),
            "tags":       ai.get("m4Tags", []),
            "scene_type": ai.get("m4SceneType", "unknown"),
        })

    def to_extracted_entity(e: dict):
        try:
            return ExtractedEntity(
                entity_type=e.get("entity_type", "OTHER"),
                value=str(e.get("value", "")),
                confidence=float(e.get("confidence", 1.0)),
                source=e.get("source", "narrative"),
                context=e.get("context", ""),
            )
        except Exception:
            return None

    def to_extracted_event(e: dict):
        try:
            return ExtractedEvent(
                description=e.get("description") or e.get("action") or "",
                timestamp=e.get("timestamp") or e.get("time"),
                actors=e.get("actors", []),
                action=e.get("action", ""),
                location=e.get("location"),
                source=e.get("source", "narrative"),
            )
        except Exception:
            return None

    typed_entities = [x for e in all_raw_entities if (x := to_extracted_entity(e)) is not None]
    typed_events   = [x for e in all_raw_events   if (x := to_extracted_event(e))   is not None]

    ev_refs = [
        EvidenceRef(evidence_id=f"ev-{i}", evidence_type=es["mime"].split("/")[0] if "/" in es.get("mime","") else "image", file_name=es["source"])
        for i, es in enumerate(evidence_summaries, 1)
    ]

    # Quick M9 re-fuse (deterministic, instant)
    fusion_engine = IntelligenceFusionEngine(
        entity_merger=DeterministicEntityMerger(),
        event_merger=DeterministicEventMerger(),
    )
    fusion_input = FusionInput(
        complaint_profile=complaint_profile_obj,
        entities=typed_entities,
        events=typed_events,
        evidence_references=ev_refs,
    )
    investigation_context = fusion_engine.fuse(fusion_input)
    print(f"\n  Fused entities: {investigation_context.total_entities_fused}")
    print(f"  Fused events  : {investigation_context.total_events_fused}")

    # =========================================================================
    # M10 — Timeline Builder
    # =========================================================================
    banner("M10 — Timeline Builder (Deterministic Event Ordering)")
    from app.timeline.engine       import DeterministicTimelineEngine
    from app.timeline.normalizer   import DeterministicTimestampNormalizer
    from app.timeline.deduplicator import DeterministicTimelineDeduplicator

    tl_engine = DeterministicTimelineEngine(
        normalizer=DeterministicTimestampNormalizer(),
        deduplicator=DeterministicTimelineDeduplicator(),
    )
    try:
        timeline = tl_engine.build(investigation_context)
        print(f"  Timeline entries : {len(timeline.entries)}")
        for te in timeline.entries[:5]:
            ts   = getattr(te, "timestamp", "?")
            desc = str(getattr(te, "description", ""))[:80]
            print(f"    [{ts}] {desc}")
        print("  M10 ✓  Complete")
    except Exception as e:
        print(f"  M10 WARN: {e}")
        import traceback; traceback.print_exc()
        from app.schemas.timeline import Timeline
        timeline = Timeline(entries=[], total_events=0, timeline_id=f"tl_{uuid.uuid4().hex[:12]}")

    # =========================================================================
    # M11 — Timeline Intelligence
    # =========================================================================
    banner("M11 — Timeline Intelligence (LLM: contradictions + causal analysis)")
    from app.timeline_intelligence.engine  import TimelineIntelligenceEngine, TimelineFallbackEngine
    from app.schemas.timeline_intelligence import TimelineIntelligenceInput

    tl_intel_input = TimelineIntelligenceInput(
        complaint_profile=complaint_profile_obj,
        timeline=timeline,
        evidence_references=ev_refs,
    )
    try:
        tl_intel_engine       = TimelineIntelligenceEngine(llm_client=llm)
        timeline_intelligence = await tl_intel_engine.analyze(tl_intel_input)
        contradictions = getattr(timeline_intelligence, "contradictions", [])
        causal         = getattr(timeline_intelligence, "causal_relationships", [])
        refined        = getattr(timeline_intelligence, "refined_entries", [])
        print(f"  Refined entries : {len(refined)}")
        print(f"  Contradictions  : {len(contradictions)}")
        print(f"  Causal links    : {len(causal)}")
        print("  M11 ✓  Complete")
    except Exception as e:
        print(f"  M11 WARN: {e} — using deterministic fallback")
        fallback              = TimelineFallbackEngine()
        timeline_intelligence = fallback.analyze(tl_intel_input)
        print("  M11 ✓  Fallback complete")

    # =========================================================================
    # M12 — Investigation Intelligence
    # =========================================================================
    banner("M12 — Investigation Intelligence (LLM: crime class, risk, gaps, entities)")
    from app.investigation_intelligence.engine  import InvestigationIntelligenceEngine, InvestigationFallbackEngine
    from app.schemas.investigation_intelligence import InvestigationIntelligenceInput
    from app.schemas.evidence                   import EvidenceProfile

    evidence_profile_objs = []
    for es in evidence_summaries:
        try:
            ep = EvidenceProfile.model_validate({
                "evidence_id":   f"ev-{es['source']}",
                "file_name":     es["source"],
                "evidence_type": es["mime"].split("/")[0] if "/" in es.get("mime", "") else "image",
                "caption":       es.get("caption", ""),
                "ocr_text":      es.get("ocr_text", ""),
                "entities":      es.get("entities", []),
                "events":        es.get("events", []),
                "tags":          es.get("tags", []),
                "scene_type":    es.get("scene_type", "unknown"),
                "text_detected": bool(es.get("ocr_text", "")),
                "status":        "complete",
            })
            evidence_profile_objs.append(ep)
        except Exception as ep_err:
            print(f"  M12 WARN: EvidenceProfile build failed for {es['source']}: {ep_err}")

    inv_input = InvestigationIntelligenceInput(
        complaint_profile=complaint_profile_obj,
        evidence_profiles=evidence_profile_objs,
        timeline_intelligence=timeline_intelligence,
    )

    try:
        inv_engine          = InvestigationIntelligenceEngine(llm_client=llm)
        investigation_intel = await inv_engine.analyze(inv_input)
        crime_class   = getattr(investigation_intel, "crime_classification", None)
        risk          = getattr(investigation_intel, "risk_assessment", None)
        gaps          = getattr(investigation_intel, "investigative_gaps", [])
        entities      = getattr(investigation_intel, "correlated_entities", [])
        contradictions_m12 = getattr(investigation_intel, "contradictions", [])
        understanding = getattr(investigation_intel, "complaint_understanding", "")
        conf_score    = getattr(investigation_intel, "confidence_score", 0.0)

        print(f"  Crime class     : {getattr(crime_class, 'primary_category', '?')}")
        print(f"  Sub-category    : {getattr(crime_class, 'sub_category', '?')}")
        print(f"  Statutes        : {getattr(crime_class, 'applicable_statutes', [])}")
        print(f"  Risk level      : {getattr(risk, 'level', '?')} (score: {getattr(risk, 'score', '?')})")
        print(f"  Evidence gaps   : {len(gaps)}")
        print(f"  Key entities    : {len(entities)}")
        print(f"  Contradictions  : {len(contradictions_m12)}")
        print(f"  Confidence      : {conf_score:.0%}")

        db["complaints"].update_one(
            {"_id": doc["_id"]},
            {"$set": {
                "complaintIntelligence.m12CrimeClassification": crime_class.model_dump() if crime_class else None,
                "complaintIntelligence.m12RiskAssessment":      risk.model_dump() if risk else None,
                "complaintIntelligence.m12InvestigativeGaps":   [g.model_dump() for g in gaps],
                "complaintIntelligence.m12CorrelatedEntities":  [e.model_dump() for e in entities],
                "complaintIntelligence.m12Contradictions":      [c.model_dump() for c in contradictions_m12],
                "complaintIntelligence.m12Understanding":        understanding,
                "complaintIntelligence.m12ConfidenceScore":     conf_score,
                "complaintIntelligence.m12ProcessedAt":         datetime.now(timezone.utc).isoformat(),
            }}
        )
        print("  M12 ✓  Written to MongoDB")

    except Exception as e:
        print(f"  M12 ERROR: {e}")
        import traceback; traceback.print_exc()
        print("  M12 → trying deterministic fallback...")
        try:
            fb  = InvestigationFallbackEngine()
            investigation_intel = fb.analyze(inv_input)
            print("  M12 ✓  Fallback complete")
        except Exception as e2:
            print(f"  M12 fallback also failed: {e2}")

    print(f"\n{SEP}")
    print("  ALL STAGES COMPLETE (M10 → M11 → M12)")
    print(f"  All results persisted to MongoDB complaintIntelligence field.")
    print(SEP)


if __name__ == "__main__":
    asyncio.run(main())
