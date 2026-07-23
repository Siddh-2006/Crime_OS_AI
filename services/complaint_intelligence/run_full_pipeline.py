"""
Full M1–M12 Pipeline Orchestrator for Crime OS Complaint Intelligence.

Stages:
  M1  — Language detection & ingestion bookkeeping
  M2  — LLM complaint profile (crime type, priority, confidence, summary)
  M3  — Text intelligence on narrative (NER, regex, events)
  M4  — Image worker per evidence file (Florence-2: captioning + text detection)
  M5  — OCR worker per image (PaddleOCR)
  M6  — Text intelligence on OCR/PDF/audio output
  M7  — PDF worker (pdf evidence files)
  M8  — Audio worker (audio/video evidence files)
  M9  — Intelligence fusion (entity + event merging via DeterministicEntityMerger)
  M10 — Timeline builder (DeterministicTimelineEngine on InvestigationContext)
  M11 — Timeline Intelligence (LLM: contradiction + causal analysis)
  M12 — Investigation Intelligence (LLM: crime class, risk, gaps, entities)

All results are persisted back to MongoDB.

Usage:
  $env:PYTHONUTF8=1; .venv\\Scripts\\python.exe run_full_pipeline.py
"""
import asyncio
import base64
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.absolute()))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / "backend" / ".env")

import httpx
from pymongo import MongoClient

from app.core.config import settings

COMPLAINT_NUMBER = sys.argv[1] if len(sys.argv) > 1 else os.getenv("COMPLAINT_NUMBER", "COMP-55333382-6280-494a-ab79-4665d3dcb3f0")
SEP  = "=" * 70
DIV  = "-" * 70
T0_GLOBAL = time.perf_counter()


def banner(title: str) -> None:
    elapsed = time.perf_counter() - T0_GLOBAL
    print(f"\n{SEP}")
    print(f"  {title}")
    print(f"  Total elapsed: {elapsed:.1f}s")
    print(SEP)


def section(label: str) -> None:
    print(f"\n{DIV}")
    print(f"  {label}")
    print(DIV)


async def download_bytes(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.get(url)
        r.raise_for_status()
        return r.content


async def main() -> None:
    # ── DB ────────────────────────────────────────────────────────────────────
    mongo_uri = settings.MONGODB_URI or os.getenv("MONGODB_URI")
    db_name = settings.MONGODB_DB or "crime_os"
    mongo = MongoClient(mongo_uri)
    db = mongo[db_name]
    doc = db["complaints"].find_one({"complaintNumber": COMPLAINT_NUMBER})
    if not doc:
        print(f"ERROR: Complaint {COMPLAINT_NUMBER} not found in MongoDB.")
        return

    print(SEP)
    print("  CRIME OS — FULL COMPLAINT INTELLIGENCE PIPELINE  (M1 → M12)")
    print(SEP)
    print(f"  Complaint  : {doc['complaintNumber']}")
    print(f"  Short desc : {doc.get('shortDescription', '')}")
    print(f"  Status     : {doc.get('status', '')}")
    print(f"  Evidence   : {len(doc.get('evidence', []))} file(s)")
    print(f"  Model      : {settings.OLLAMA_MODEL} @ {settings.OLLAMA_BASE_URL}")

    narrative    = doc.get("detailedDescription", "")
    evidence_raw = doc.get("evidence", [])

    # ── Shared workers ────────────────────────────────────────────────────────
    from app.llm.client       import OllamaLLMClient
    from app.queue.mock_queue import MockQueue

    llm = OllamaLLMClient(
        base_url=settings.OLLAMA_BASE_URL,
        model=settings.OLLAMA_MODEL,
        timeout=300,
        num_ctx=settings.OLLAMA_NUM_CTX,
    )
    queue = MockQueue()

    # ── Shared text intelligence worker (reused across M3/M6) ─────────────────
    from app.text_intelligence.ner_extractor   import SpacyNERExtractor
    from app.text_intelligence.regex_extractor import IndianRegexExtractor
    from app.text_intelligence.event_extractor import TemporalEventExtractor
    from app.text_intelligence.entity_linker   import PassthroughEntityLinker
    from app.text_intelligence.worker          import TextIntelligenceWorker

    ti_worker = TextIntelligenceWorker(
        ner_extractor=SpacyNERExtractor(),
        regex_extractor=IndianRegexExtractor(),
        event_extractor=TemporalEventExtractor(),
        entity_linker=PassthroughEntityLinker(),
    )

    # =========================================================================
    # M1 — Language Detection & Complaint Ingestion
    # =========================================================================
    banner("M1 — Language Detection & Complaint Ingestion")
    try:
        from langdetect import detect as langdetect_detect
        lang = langdetect_detect(narrative)
    except Exception:
        lang = "en"
    print(f"  Detected language : {lang}")
    print(f"  Narrative length  : {len(narrative)} chars")
    db["complaints"].update_one(
        {"_id": doc["_id"]},
        {"$set": {
            "complaintIntelligence.detectedLanguage": lang,
            "complaintIntelligence.m1ProcessedAt": datetime.now(timezone.utc).isoformat(),
        }}
    )
    print("  M1 ✓  Written to MongoDB")

    # =========================================================================
    # M2 — LLM Complaint Profile
    # =========================================================================
    banner("M2 — LLM Complaint Profile (crime type, priority, confidence, summary)")
    from app.llm.worker import ComplaintProfileWorker
    worker_m2 = ComplaintProfileWorker(llm_client=llm)
    result_m2  = await worker_m2.run(
        payload={"text": narrative},
        job_id=f"m2-{doc['_id']}",
    )
    if not result_m2.succeeded:
        print(f"  M2 FAILED: {result_m2.error}")
        profile_dict = {
            "crime_type": "unknown", "priority": "medium",
            "confidence": 0.0, "summary": narrative[:200],
            "missing_information": [], "recommendations": [],
        }
    else:
        profile_dict = result_m2.output
        print(f"  Crime Type  : {profile_dict.get('crime_type')}")
        print(f"  Priority    : {profile_dict.get('priority', '').upper()}")
        print(f"  Confidence  : {profile_dict.get('confidence', 0):.0%}")
        print(f"  Summary     : {str(profile_dict.get('summary', ''))[:120]}")
        db["complaints"].update_one(
            {"_id": doc["_id"]},
            {"$set": {
                "complaintIntelligence.crimeType":           profile_dict["crime_type"],
                "complaintIntelligence.priority":            profile_dict["priority"],
                "complaintIntelligence.confidence":          profile_dict["confidence"],
                "complaintIntelligence.summary":             profile_dict["summary"],
                "complaintIntelligence.missingInformation":  profile_dict.get("missing_information", []),
                "complaintIntelligence.recommendations":     profile_dict.get("recommendations", []),
                "complaintIntelligence.m2ProcessedAt":       datetime.now(timezone.utc).isoformat(),
            }}
        )
        print("  M2 ✓  Written to MongoDB")

    # Build ComplaintProfile Pydantic object (used in M9/M11/M12)
    from app.schemas.complaint import ComplaintProfile
    complaint_profile_obj = ComplaintProfile(
        crime_type=profile_dict.get("crime_type", "unknown"),
        priority=profile_dict.get("priority", "medium"),
        confidence=float(profile_dict.get("confidence", 0.0)),
        summary=profile_dict.get("summary", ""),
        missing_information=profile_dict.get("missing_information", []),
        recommendations=profile_dict.get("recommendations", []),
    )

    # =========================================================================
    # M3 — Text Intelligence on Narrative
    # =========================================================================
    banner("M3 — Text Intelligence on Narrative (NER + Regex + Events)")
    result_m3 = await ti_worker.run(
        payload={"text": narrative, "source_type": "complaint", "file_name": "narrative"},
        job_id=f"m3-narrative-{doc['_id']}",
    )
    narrative_entities: list = []
    narrative_events:   list = []
    if result_m3.succeeded:
        narrative_entities = result_m3.output.get("entities", [])
        narrative_events   = result_m3.output.get("events", [])
        print(f"  Entities extracted : {len(narrative_entities)}")
        print(f"  Events extracted   : {len(narrative_events)}")
        db["complaints"].update_one(
            {"_id": doc["_id"]},
            {"$set": {
                "complaintIntelligence.m3Entities":    narrative_entities,
                "complaintIntelligence.m3Events":      narrative_events,
                "complaintIntelligence.m3ProcessedAt": datetime.now(timezone.utc).isoformat(),
            }}
        )
        print("  M3 ✓  Written to MongoDB")
    else:
        print(f"  M3 FAILED: {result_m3.error}")

    # =========================================================================
    # M4 + M5 + M6/M7/M8 — Evidence Processing per file
    # =========================================================================
    banner("M4/M5/M6/M7/M8 — Evidence Processing (Image → OCR → NER per file)")

    from app.image_worker.captioner          import FlorenceCaptioner
    from app.image_worker.text_detector      import FlorenceTextDetector
    from app.image_worker.evidence_builder   import EvidenceBuilder
    from app.image_worker.metadata_extractor import PILMetadataExtractor
    from app.image_worker.preprocessor       import PILImagePreprocessor
    from app.image_worker.worker             import ImageWorker
    from app.ocr_worker.engine               import PaddleOCREngine
    from app.ocr_worker.translator           import NoOpTranslator
    from app.ocr_worker.worker               import OCRWorker

    img_worker = ImageWorker(
        metadata_extractor=PILMetadataExtractor(),
        preprocessor=PILImagePreprocessor(),
        text_detector=FlorenceTextDetector(),
        captioner=FlorenceCaptioner(),
        evidence_builder=EvidenceBuilder(),
        queue=queue,
    )
    ocr_worker = OCRWorker(
        ocr_engine=PaddleOCREngine(),
        translator=NoOpTranslator(),
        queue=queue,
    )

    all_entities: list = list(narrative_entities)
    all_events:   list = list(narrative_events)
    evidence_summaries: list  = []  # lightweight dicts used for M9/M12
    updated_evidence:   list  = []

    for idx, ev in enumerate(evidence_raw, 1):
        fname = ev.get("originalFilename", f"file_{idx}")
        url   = ev.get("secureUrl", "")
        mime  = ev.get("mimeType", "")
        size  = ev.get("size", 0)

        section(f"[{idx}/{len(evidence_raw)}] {fname}  ({mime})")

        ev_enriched = {k: v for k, v in ev.items()}          # shallow copy
        ev_enriched.setdefault("aiMetadata", {})

        ev_entities: list = []
        ev_events:   list = []
        ev_ocr_text        = ""
        ev_caption         = ""
        ev_scene_type      = "unknown"
        ev_tags: list      = []

        # ── M7: PDF ───────────────────────────────────────────────────────────
        if "pdf" in mime.lower():
            print("  [M7] PDF detected — running PDF worker...")
            try:
                from app.pdf_worker.worker import PDFWorker
                pdf_w      = PDFWorker(queue=queue)
                pdf_bytes  = await download_bytes(url)
                pdf_result = await pdf_w.run(
                    payload={"pdf_bytes_b64": base64.b64encode(pdf_bytes).decode(), "file_name": fname},
                    job_id=f"pdf-{idx}",
                )
                if pdf_result.succeeded:
                    extracted = (pdf_result.output or {}).get("text", "")
                    ev_enriched["aiMetadata"]["pdfText"] = extracted
                    ev_ocr_text = extracted
                    print(f"  [M7] Extracted {len(extracted)} chars from PDF")
                    if extracted.strip():
                        ti_r = await ti_worker.run(
                            payload={"text": extracted, "source_type": "pdf", "file_name": fname},
                            job_id=f"m6-pdf-{idx}",
                        )
                        if ti_r.succeeded:
                            ev_entities = ti_r.output.get("entities", [])
                            ev_events   = ti_r.output.get("events", [])
                            all_entities.extend(ev_entities)
                            all_events.extend(ev_events)
                            print(f"  [M6] NER: {len(ev_entities)} entities, {len(ev_events)} events")
                else:
                    print(f"  [M7] PDF FAILED: {pdf_result.error}")
            except Exception as e:
                print(f"  [M7] PDF worker error: {e}")

        # ── M8: Audio / Video ─────────────────────────────────────────────────
        elif mime.startswith("audio/") or mime.startswith("video/"):
            print(f"  [M8] Audio/Video ({mime}) — running audio worker...")
            try:
                from app.audio_worker.worker import AudioWorker
                aud_w        = AudioWorker(queue=queue)
                audio_bytes  = await download_bytes(url)
                audio_result = await aud_w.run(
                    payload={"audio_bytes_b64": base64.b64encode(audio_bytes).decode(), "file_name": fname},
                    job_id=f"audio-{idx}",
                )
                if audio_result.succeeded:
                    transcript = (audio_result.output or {}).get("transcript", "")
                    ev_enriched["aiMetadata"]["speechTranscript"] = transcript
                    ev_ocr_text = transcript
                    print(f"  [M8] Transcript: {len(transcript)} chars")
                    if transcript.strip():
                        ti_r = await ti_worker.run(
                            payload={"text": transcript, "source_type": "audio", "file_name": fname},
                            job_id=f"m6-audio-{idx}",
                        )
                        if ti_r.succeeded:
                            ev_entities = ti_r.output.get("entities", [])
                            ev_events   = ti_r.output.get("events", [])
                            all_entities.extend(ev_entities)
                            all_events.extend(ev_events)
                else:
                    print(f"  [M8] Audio FAILED: {audio_result.error}")
            except Exception as e:
                print(f"  [M8] Audio worker error: {e}")

        # ── M4 + M5 + M6: Image ───────────────────────────────────────────────
        elif mime.startswith("image/"):
            print("  [M4] Downloading image...")
            img_bytes = await download_bytes(url)
            img_b64   = base64.b64encode(img_bytes).decode()
            print(f"  [M4] Downloaded {len(img_bytes)/1024:.1f} KB — running ImageWorker (Florence-2)...")

            img_result = await img_worker.run(
                payload={"image_bytes_b64": img_b64, "file_name": fname, "file_size_bytes": size},
                job_id=f"img-{idx}",
            )
            ep           = img_result.output or {}
            analysis     = ep.get("analysis") or {}
            text_detected= ep.get("text_detected", False)
            ev_caption   = analysis.get("description", ep.get("caption", ""))
            ev_scene_type= analysis.get("scene_type", ep.get("scene_type", "unknown"))
            ev_tags      = analysis.get("tags", ep.get("tags", []))
            classification      = analysis.get("classification", ep.get("classification", "Unknown"))
            classification_conf = analysis.get("classification_confidence", ep.get("classification_confidence", 0.0))

            print(f"  [M4] Scene type    : {ev_scene_type}")
            print(f"  [M4] Tags          : {ev_tags[:6]}")
            print(f"  [M4] Text detected : {text_detected}")
            if ev_caption:
                print(f"  [M4] Caption       : {ev_caption[:100]}")

            ev_enriched["aiMetadata"].update({
                "m4SceneType":             ev_scene_type,
                "m4Tags":                  ev_tags,
                "m4Caption":               ev_caption,
                "m4TextDetected":          text_detected,
                "imageTags":               ev_tags,
                "classification":          classification,
                "classificationConfidence": classification_conf,
                "aiSummary":               ev_caption,
            })

            if text_detected:
                # M5: OCR
                print("  [M5] Running PaddleOCR...")
                ocr_result = await ocr_worker.run(
                    payload={"image_bytes_b64": img_b64, "file_name": fname, "evidence_id": ep.get("evidence_id")},
                    job_id=f"ocr-{idx}",
                )
                if ocr_result.succeeded:
                    ocr_data = ocr_result.output or {}
                    ocr_out  = ocr_data.get("ocr_result", {})
                    ev_ocr_text = ocr_out.get("raw_text", "")
                    conf     = ocr_out.get("average_confidence", 0)
                    lines    = ocr_out.get("line_count", 0)
                    print(f"  [M5] OCR: {lines} lines, {conf:.0%} avg confidence")
                    if ev_ocr_text:
                        print(f"  [M5] Sample: {ev_ocr_text[:120].replace(chr(10),' ')}")
                    ev_enriched["aiMetadata"]["ocrText"] = ev_ocr_text
                else:
                    print(f"  [M5] OCR FAILED: {ocr_result.error}")

                # M6: Text Intelligence on OCR
                if ev_ocr_text.strip():
                    print("  [M6] Running NER + Regex + Events on OCR text...")
                    ti_r = await ti_worker.run(
                        payload={"text": ev_ocr_text, "source_type": "ocr", "file_name": fname},
                        job_id=f"m6-ocr-{idx}",
                    )
                    if ti_r.succeeded:
                        ev_entities = ti_r.output.get("entities", [])
                        ev_events   = ti_r.output.get("events", [])
                        all_entities.extend(ev_entities)
                        all_events.extend(ev_events)
                        print(f"  [M6] Extracted {len(ev_entities)} entities, {len(ev_events)} events")
            else:
                print("  [M5] OCR skipped — no text detected")

        else:
            print(f"  SKIP — unsupported MIME type: {mime}")
            updated_evidence.append(ev_enriched)
            continue

        ev_enriched["aiMetadata"]["m3Entities"]     = ev_entities
        ev_enriched["aiMetadata"]["m3Events"]        = ev_events
        ev_enriched["aiMetadata"]["processingStatus"] = "PROCESSED"

        evidence_summaries.append({
            "source":     fname,
            "mime":       mime,
            "scene_type": ev_scene_type,
            "tags":       ev_tags,
            "caption":    ev_caption,
            "ocr_text":   ev_ocr_text,
            "entities":   ev_entities,
            "events":     ev_events,
        })
        updated_evidence.append(ev_enriched)

    # Write updated evidence back to MongoDB
    db["complaints"].update_one(
        {"_id": doc["_id"]},
        {"$set": {"evidence": updated_evidence}}
    )
    print(f"\n  M4/M5/M6/M7/M8 ✓  {len(updated_evidence)} evidence file(s) written to MongoDB")

    # =========================================================================
    # M9 — Intelligence Fusion
    # =========================================================================
    banner("M9 — Intelligence Fusion (Deterministic Entity + Event Merging)")
    from app.fusion.fusion_engine import IntelligenceFusionEngine
    from app.fusion.entity_merger import DeterministicEntityMerger
    from app.fusion.event_merger  import DeterministicEventMerger
    from app.schemas.fusion       import FusionInput, EvidenceRef

    # Build EvidenceRef list
    ev_refs = []
    for i, es in enumerate(evidence_summaries, 1):
        ev_refs.append(EvidenceRef(
            evidence_id=f"ev-{i}",
            evidence_type=es["mime"].split("/")[0] if "/" in es["mime"] else "image",
            file_name=es["source"],
        ))

    fusion_engine = IntelligenceFusionEngine(
        entity_merger=DeterministicEntityMerger(),
        event_merger=DeterministicEventMerger(),
    )

    from app.schemas.text_intelligence import ExtractedEntity, ExtractedEvent

    def to_extracted_entity(e: dict) -> ExtractedEntity | None:
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

    def to_extracted_event(e: dict) -> ExtractedEvent | None:
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

    typed_entities = [x for e in all_entities if (x := to_extracted_entity(e)) is not None]
    typed_events   = [x for e in all_events   if (x := to_extracted_event(e))   is not None]

    fusion_input = FusionInput(
        complaint_profile=complaint_profile_obj,
        entities=typed_entities,
        events=typed_events,
        evidence_references=ev_refs,
    )
    investigation_context = fusion_engine.fuse(fusion_input)
    print(f"  Fused entities : {investigation_context.total_entities_fused}")
    print(f"  Fused events   : {investigation_context.total_events_fused}")
    print(f"  Context ID     : {investigation_context.context_id}")
    print("  M9 ✓  Complete")

    # =========================================================================
    # M10 — Deterministic Timeline Builder
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
        print(f"  Timeline events  : {len(timeline.entries)}")
        m10_entries = []
        for te in timeline.entries:
            m10_entries.append({
                "timestamp": getattr(te, "raw_timestamp", None) or getattr(te, "timestamp", "N/A"),
                "description": getattr(te, "description", ""),
                "actors": getattr(te, "actors", []),
                "action": getattr(te, "action", ""),
                "location": getattr(te, "location", None),
                "sources": getattr(te, "sources", []),
            })
        # Build detailed, high-quality investigation timeline combining narrative + evidence
        investigation_timeline = []

        # 1. Events from Narrative
        if narrative_events:
            for ne in narrative_events:
                ts = ne.get("timestamp") or ne.get("time") or "Incident Date"
                desc = ne.get("description") or ne.get("source_text") or ""
                if desc:
                    investigation_timeline.append({
                        "time": ts,
                        "event": desc,
                        "source": "complaint narrative",
                        "category": "Complaint Narrative"
                    })

        # 2. Events from Evidence OCR & AI Vision Summaries
        for es in evidence_summaries:
            src = es.get("source", "Evidence")
            caption = es.get("caption", "")
            ocr = es.get("ocr_text", "")
            ev_events_list = es.get("events", [])
            
            if ev_events_list:
                for ee in ev_events_list:
                    ts = ee.get("timestamp") or ee.get("time") or "Evidence Date"
                    desc = ee.get("description") or ee.get("source_text") or caption or f"Evidence document: {src}"
                    investigation_timeline.append({
                        "time": ts,
                        "event": f"[{src}] {desc}",
                        "source": src,
                        "category": "Evidence Event"
                    })
            elif "invoice" in caption.lower() or "invoice" in ocr.lower():
                investigation_timeline.append({
                    "time": "Invoice Date",
                    "event": f"Device/Purchase Invoice ({src}): {ocr[:120]}...",
                    "source": src,
                    "category": "Device Invoice"
                })
            elif "statement" in ocr.lower() or "bank" in ocr.lower():
                investigation_timeline.append({
                    "time": "Statement Period",
                    "event": f"Bank Account Statement ({src}): {ocr[:120]}...",
                    "source": src,
                    "category": "Bank Statement"
                })
            elif caption or ocr:
                investigation_timeline.append({
                    "time": "Evidence Event",
                    "event": f"[{src}] {caption or ocr[:120]}",
                    "source": src,
                    "category": "Evidence Analysis"
                })

        db["complaints"].update_one(
            {"_id": doc["_id"]},
            {"$set": {
                "complaintIntelligence.m10Timeline": m10_entries,
                "complaintIntelligence.investigationTimeline": investigation_timeline,
                "complaintIntelligence.m10ProcessedAt": datetime.now(timezone.utc).isoformat(),
            }}
        )
        print(f"  M10 ✓  Written {len(investigation_timeline)} detailed timeline events to MongoDB")
    except Exception as e:
        print(f"  M10 WARN: {e} — building empty timeline")
        import traceback; traceback.print_exc()
        from app.schemas.timeline import Timeline
        timeline = Timeline(entries=[], total_events=0, timeline_id=f"tl_{uuid.uuid4().hex[:12]}")

    # =========================================================================
    # M11 — Timeline Intelligence (LLM-enhanced)
    # =========================================================================
    banner("M11 — Timeline Intelligence (LLM contradiction + causal analysis)")
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

    # Build minimal EvidenceProfile objects from our summaries
    evidence_profile_objs: list[EvidenceProfile] = []
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
            print(f"  M12 WARN: could not build EvidenceProfile for {es['source']}: {ep_err}")

    inv_input = InvestigationIntelligenceInput(
        complaint_profile=complaint_profile_obj,
        evidence_profiles=evidence_profile_objs,
        timeline_intelligence=timeline_intelligence,
    )

    try:
        inv_engine             = InvestigationIntelligenceEngine(llm_client=llm)
        investigation_intel    = await inv_engine.analyze(inv_input)
        crime_class  = getattr(investigation_intel, "crime_classification", None)
        risk         = getattr(investigation_intel, "risk_assessment", None)
        gaps         = getattr(investigation_intel, "investigative_gaps", [])
        entities     = getattr(investigation_intel, "correlated_entities", [])
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

        # Write M12 output to MongoDB
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
        print("  M12 → Falling back to deterministic engine...")
        try:
            fallback_inv       = InvestigationFallbackEngine()
            investigation_intel = fallback_inv.analyze(inv_input)
            print("  M12 ✓  Fallback complete (no LLM output persisted)")
        except Exception as e2:
            print(f"  M12 fallback also failed: {e2}")

    # =========================================================================
    # FINAL SUMMARY
    # =========================================================================
    elapsed = time.perf_counter() - T0_GLOBAL
    banner(f"ALL STAGES COMPLETE — Total time: {elapsed:.1f}s")
    print(f"  Complaint        : {COMPLAINT_NUMBER}")
    print(f"  Language         : {lang}")
    print(f"  Crime type       : {profile_dict.get('crime_type', '?')}")
    print(f"  Priority         : {profile_dict.get('priority', '?').upper()}")
    print(f"  LLM Confidence   : {profile_dict.get('confidence', 0):.0%}")
    print(f"  Total entities   : {len(typed_entities)} (pre-fusion)")
    print(f"  Fused entities   : {investigation_context.total_entities_fused}")
    print(f"  Total events     : {len(typed_events)}")
    print(f"  Evidence files   : {len(updated_evidence)}")
    print(f"\n  All results persisted to MongoDB → complaintIntelligence field")
    print(SEP)


if __name__ == "__main__":
    asyncio.run(main())
