"""
Full Evidence Pipeline runner for COMP-55333382-6280-494a-ab79-4665d3dcb3f0.

Chain: MongoDB fetch → download evidence from Cloudinary
       → M4 ImageWorker (Florence-2 text detection + captioning)
       → M5 OCR Worker (PaddleOCR + translation)
       → M3 TextIntelligenceWorker (NER + regex + events)
       → write enriched results back to MongoDB

Run: .venv\Scripts\python.exe run_evidence_pipeline.py
"""
import asyncio
import base64
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.absolute()))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / "backend" / ".env")

import httpx
from pymongo import MongoClient
from bson import ObjectId

from app.image_worker.captioner import FlorenceCaptioner
from app.image_worker.text_detector import FlorenceTextDetector
from app.image_worker.evidence_builder import EvidenceBuilder
from app.image_worker.metadata_extractor import PILMetadataExtractor
from app.image_worker.preprocessor import PILImagePreprocessor
from app.image_worker.worker import ImageWorker
from app.ocr_worker.engine import PaddleOCREngine
from app.ocr_worker.translator import NoOpTranslator
from app.ocr_worker.worker import OCRWorker
from app.queue.mock_queue import MockQueue
from app.text_intelligence.entity_linker import PassthroughEntityLinker
from app.text_intelligence.event_extractor import TemporalEventExtractor
from app.text_intelligence.ner_extractor import SpacyNERExtractor
from app.text_intelligence.regex_extractor import IndianRegexExtractor
from app.text_intelligence.worker import TextIntelligenceWorker

COMPLAINT_NUMBER = "COMP-55333382-6280-494a-ab79-4665d3dcb3f0"
SEP = "=" * 70
DIV = "-" * 70


async def download_image(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content


async def run_text_intelligence(text: str, source: str, file_name: str) -> dict:
    worker = TextIntelligenceWorker(
        ner_extractor=SpacyNERExtractor(),
        regex_extractor=IndianRegexExtractor(),
        event_extractor=TemporalEventExtractor(),
        entity_linker=PassthroughEntityLinker(),
    )
    result = await worker.run(
        payload={"text": text, "source_type": source, "file_name": file_name},
        job_id=f"ti-{file_name[:20]}",
    )
    return result.output or {}


async def main():
    # ── 1. Fetch complaint from MongoDB ───────────────────────────────────────
    mongo_uri = os.getenv("MONGODB_URI")
    mongo = MongoClient(mongo_uri)
    db = mongo["test"]
    doc = db["complaints"].find_one({"complaintNumber": COMPLAINT_NUMBER})
    if not doc:
        print(f"Complaint {COMPLAINT_NUMBER} not found.")
        return

    evidence_files = doc.get("evidence", [])
    print(SEP)
    print(f"FULL EVIDENCE PIPELINE — {COMPLAINT_NUMBER}")
    print(SEP)
    print(f"Complaint : {doc.get('shortDescription')}")
    print(f"Evidence  : {len(evidence_files)} file(s)")
    print()

    # ── 2. Build workers (shared across all files) ────────────────────────────
    queue = MockQueue()
    image_worker = ImageWorker(
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

    all_results = []
    all_entities = []
    all_events = []

    # ── 3. Process each evidence file ─────────────────────────────────────────
    for idx, ev in enumerate(evidence_files, 1):
        fname = ev.get("originalFilename", "unknown")
        url   = ev.get("secureUrl", "")
        mime  = ev.get("mimeType", "")
        size  = ev.get("size", 0)

        print(f"[{idx}/{len(evidence_files)}] {fname}")
        print(f"  MIME : {mime}  |  Size: {size/1024:.1f} KB")

        if not mime.startswith("image/"):
            print(f"  SKIP : not an image ({mime})")
            print()
            continue

        # Download
        print(f"  Downloading from Cloudinary...")
        t0 = time.perf_counter()
        image_bytes = await download_image(url)
        print(f"  Downloaded {len(image_bytes)/1024:.1f} KB in {(time.perf_counter()-t0)*1000:.0f}ms")

        image_b64 = base64.b64encode(image_bytes).decode()

        # ── M4: Image Worker ──────────────────────────────────────────────────
        print(f"  [M4] Running ImageWorker (Florence-2 text detection + captioning)...")
        img_result = await image_worker.run(
            payload={
                "image_bytes_b64": image_b64,
                "file_name": fname,
                "file_size_bytes": size,
            },
            job_id=f"img-{idx}",
        )

        evidence_profile = img_result.output or {}
        analysis          = evidence_profile.get("analysis") or {}
        text_detected     = evidence_profile.get("text_detected", False)
        caption           = analysis.get("description", "")
        scene_type        = analysis.get("scene_type", "unknown")
        tags              = analysis.get("tags", [])

        print(f"  [M4] Scene type   : {scene_type}")
        print(f"  [M4] Tags         : {tags}")
        print(f"  [M4] Text detected: {text_detected}")
        if caption:
            print(f"  [M4] Caption      : {caption[:120]}")

        ocr_text = ""
        ti_result = {}

        if text_detected:
            # ── M5: OCR Worker ────────────────────────────────────────────────
            print(f"  [M5] Running OCR Worker (PaddleOCR)...")
            ocr_result = await ocr_worker.run(
                payload={
                    "image_bytes_b64": image_b64,
                    "file_name": fname,
                    "evidence_id": evidence_profile.get("evidence_id"),
                },
                job_id=f"ocr-{idx}",
            )

            if ocr_result.succeeded:
                ocr_data = ocr_result.output or {}
                ocr_out  = ocr_data.get("ocr_result", {})
                ocr_text = ocr_out.get("raw_text", "")
                lines    = ocr_out.get("line_count", 0)
                words    = ocr_out.get("word_count", 0)
                conf     = ocr_out.get("average_confidence", 0)
                print(f"  [M5] OCR: {lines} lines, {words} words, {conf:.0%} avg confidence")
                if ocr_text:
                    print(f"  [M5] OCR text (first 200 chars):")
                    for line in ocr_text[:200].split('\n'):
                        if line.strip():
                            print(f"       {line.strip()}")
            else:
                print(f"  [M5] OCR FAILED: {ocr_result.error}")

            # ── M3: Text Intelligence ─────────────────────────────────────────
            if ocr_text.strip():
                print(f"  [M3] Running Text Intelligence (NER + Regex + Events)...")
                ti_result = await run_text_intelligence(ocr_text, "ocr", fname)
                entities = ti_result.get("entities", [])
                events   = ti_result.get("events", [])
                print(f"  [M3] Extracted: {len(entities)} entities, {len(events)} events")
                all_entities.extend(entities)
                all_events.extend(events)

                # Print top entities
                if entities:
                    entity_summary = {}
                    for e in entities:
                        etype = e.get("entity_type", "?")
                        entity_summary.setdefault(etype, []).append(e.get("value", ""))
                    for etype, vals in entity_summary.items():
                        print(f"       {etype}: {', '.join(str(v) for v in vals[:3])}")
        else:
            print(f"  [M5] OCR skipped — no text detected in this image")

        all_results.append({
            "file_name": fname,
            "evidence_id": evidence_profile.get("evidence_id"),
            "scene_type": scene_type,
            "tags": tags,
            "caption": caption,
            "text_detected": text_detected,
            "ocr_text": ocr_text,
            "entities": ti_result.get("entities", []),
            "events": ti_result.get("events", []),
        })
        print()

    # ── 4. Combined text intelligence on complaint narrative ──────────────────
    narrative = doc.get("detailedDescription", "")
    print(DIV)
    print("[M3] Running Text Intelligence on complaint narrative...")
    narrative_ti = await run_text_intelligence(narrative, "complaint", "narrative")
    narrative_entities = narrative_ti.get("entities", [])
    narrative_events   = narrative_ti.get("events", [])
    print(f"     Narrative entities: {len(narrative_entities)}")
    print(f"     Narrative events  : {len(narrative_events)}")
    all_entities.extend(narrative_entities)
    all_events.extend(narrative_events)

    # ── 5. Print consolidated intelligence summary ────────────────────────────
    print()
    print(SEP)
    print("CONSOLIDATED INTELLIGENCE SUMMARY")
    print(SEP)

    # Deduplicate entities by type+value
    seen = set()
    deduped_entities = []
    for e in all_entities:
        key = (e.get("entity_type",""), str(e.get("value","")))
        if key not in seen:
            seen.add(key)
            deduped_entities.append(e)

    entity_by_type: dict[str, list[str]] = {}
    for e in deduped_entities:
        entity_by_type.setdefault(e.get("entity_type","other"), []).append(str(e.get("value","")))

    print(f"Total unique entities : {len(deduped_entities)}")
    print(f"Total events          : {len(all_events)}")
    print()
    print("ENTITIES BY TYPE:")
    for etype, vals in sorted(entity_by_type.items()):
        print(f"  {etype:<20}: {', '.join(vals[:5])}")
    if all_events:
        print()
        print("TIMELINE EVENTS:")
        for ev in all_events[:6]:
            ts  = ev.get("timestamp","?")
            act = ev.get("action","")
            desc = ev.get("description","")[:80]
            loc = ev.get("location","")
            print(f"  [{ts}] {act} — {desc} {('@ '+loc) if loc else ''}")

    # ── 6. Write enriched results back to MongoDB ─────────────────────────────
    print()
    print(DIV)
    print("Writing enriched evidence intelligence to MongoDB...")

    updated_evidence = []
    orig_evidence    = doc.get("evidence", [])
    for orig in orig_evidence:
        fname = orig.get("originalFilename","")
        enriched = next((r for r in all_results if r["file_name"] == fname), None)
        if enriched:
            orig["aiMetadata"] = orig.get("aiMetadata") or {}
            orig["aiMetadata"].update({
                "m4SceneType": enriched["scene_type"],
                "m4Tags": enriched["tags"],
                "m4Caption": enriched["caption"],
                "m4TextDetected": enriched["text_detected"],
                "ocrText": enriched["ocr_text"],
                "m3Entities": enriched["entities"],
                "m3Events": enriched["events"],
                "processingStatus": "PROCESSED",
            })
        updated_evidence.append(orig)

    db["complaints"].update_one(
        {"_id": doc["_id"]},
        {"$set": {
            "evidence": updated_evidence,
            "complaintIntelligence.m3Entities": deduped_entities,
            "complaintIntelligence.m3Events":   all_events,
        }}
    )
    print("Done. All evidence intelligence written to MongoDB.")
    print(SEP)


if __name__ == "__main__":
    asyncio.run(main())
