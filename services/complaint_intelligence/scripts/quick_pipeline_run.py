import asyncio
import json
from pathlib import Path
import base64
from io import BytesIO

# Ensure package imports work
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.text_intelligence.ner_extractor import SpacyNERExtractor
from app.text_intelligence.regex_extractor import IndianRegexExtractor
from app.text_intelligence.event_extractor import TemporalEventExtractor
from app.text_intelligence.entity_linker import PassthroughEntityLinker
from app.text_intelligence.worker import TextIntelligenceWorker

from app.image_worker.metadata_extractor import PILMetadataExtractor
from app.image_worker.preprocessor import PILImagePreprocessor
from app.image_worker.captioner import MockImageCaptioner
from app.image_worker.text_detector import MockTextDetector
from app.image_worker.evidence_builder import EvidenceBuilder
from app.image_worker.worker import ImageWorker

from app.queue.mock_queue import MockQueue

from app.fusion.entity_merger import DeterministicEntityMerger
from app.fusion.event_merger import DeterministicEventMerger

from app.timeline.engine import DeterministicTimelineEngine
from app.timeline.normalizer import DeterministicTimestampNormalizer
from app.timeline.deduplicator import DeterministicTimelineDeduplicator

from app.timeline_intelligence.engine import TimelineIntelligenceEngine
from app.investigation_intelligence.engine import InvestigationIntelligenceEngine
from app.llm.client import MockLLMClient

from PIL import Image


def load_sample():
    # Try known locations for the sample file (repo root or service folder)
    candidates = [
        Path(__file__).parent.parent / 'sample-case-digital-arrest-fraud.json',
        Path(__file__).parent.parent.parent / 'sample-case-digital-arrest-fraud.json',
        Path(__file__).parent.parent.parent.parent / 'sample-case-digital-arrest-fraud.json',
    ]
    for p in candidates:
        if p.exists():
            return json.loads(p.read_text())
    raise FileNotFoundError('sample-case-digital-arrest-fraud.json not found in expected locations')


async def run():
    sample = load_sample()
    narrative = sample.get('complaint_summary') or sample.get('title') or ''
    print('M3 — running text intelligence on narrative')
    ti_worker = TextIntelligenceWorker(
        ner_extractor=SpacyNERExtractor(),
        regex_extractor=IndianRegexExtractor(),
        event_extractor=TemporalEventExtractor(),
        entity_linker=PassthroughEntityLinker(),
    )
    res_m3 = await ti_worker.run(payload={'text': narrative}, job_id='m3-test')
    print('  M3 succeeded:', res_m3.succeeded)
    print('  Entities:', len(res_m3.entities or []))
    print('  Regex matches:', len(res_m3.regex_matches or []))
    print('  Temporal events:', len(res_m3.temporal_events or []))

    # M4: create a synthetic image (RGB) and run ImageWorker with mocks
    print('\nM4 — running ImageWorker with mocks (no external services)')
    img = Image.new('RGB', (640, 480), color=(73, 109, 137))
    buf = BytesIO()
    img.save(buf, format='JPEG')
    img_bytes = buf.getvalue()
    img_b64 = base64.b64encode(img_bytes).decode()

    queue = MockQueue()
    img_worker = ImageWorker(
        metadata_extractor=PILMetadataExtractor(),
        preprocessor=PILImagePreprocessor(),
        text_detector=MockTextDetector(returns=False),
        captioner=MockImageCaptioner(),
        evidence_builder=EvidenceBuilder(),
        queue=queue,
    )
    img_res = await img_worker.run(payload={'image_bytes_b64': img_b64, 'file_name': 'test.jpg', 'file_size_bytes': len(img_bytes)}, job_id='img-test')
    print('  M4 succeeded:', img_res.succeeded)
    print('  EvidenceProfile keys:', sorted((img_res.output or {}).keys()))

    # M9 — deterministic fusion (merge linked entities + events)
    print('\nM9 — deterministic fusion (dedupe)')
    entity_merger = DeterministicEntityMerger()
    event_merger = DeterministicEventMerger()

    linked = res_m3.linked_entities or []
    merged_entities = await entity_merger.merge(linked)
    merged_events = await event_merger.merge(res_m3.temporal_events or [])
    print('  Merged entities:', len(merged_entities))
    print('  Merged events:', len(merged_events))

    # Build a lightweight investigation context object for timeline
    class Ctx:
        pass
    ctx = Ctx()
    ctx.temporal_events = merged_events
    ctx.total_entities_fused = len(merged_entities)
    ctx.total_events_fused = len(merged_events)
    ctx.context_id = 'ctx-test-1'

    # M10 — Timeline builder
    print('\nM10 — building timeline (deterministic)')
    tl_engine = DeterministicTimelineEngine(
        normalizer=DeterministicTimestampNormalizer(),
        deduplicator=DeterministicTimelineDeduplicator(),
    )
    tl_res = await tl_engine.build(ctx)
    print('  Timeline succeeded:', tl_res.succeeded)
    print('  Timeline events count:', tl_res.timeline_count)

    # M11 — Timeline intelligence (LLM placeholder)
    print('\nM11 — timeline intelligence (placeholder LLM)')
    tl_llm = MockLLMClient(default_response='')
    tl_intel_engine = TimelineIntelligenceEngine(llm_client=tl_llm)
    tl_intel = await tl_intel_engine.analyze(tl_res)
    print('  Timeline intelligence succeeded:', tl_intel.succeeded)

    # M12 — Investigation intelligence (placeholder LLM)
    print('\nM12 — investigation intelligence (placeholder LLM)')
    inv_llm = MockLLMClient(default_response='')
    inv_engine = InvestigationIntelligenceEngine(llm_client=inv_llm)
    inv_res = await inv_engine.analyze(ctx)
    print('  Investigation intelligence succeeded:', inv_res.succeeded)
    print('  Crime classification:', inv_res.crime_classification)

    print('\nQUICK PIPELINE COMPLETE')


if __name__ == '__main__':
    asyncio.run(run())
