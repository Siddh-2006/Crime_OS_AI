import importlib, json, traceback, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

modules = [
    'app.text_intelligence.ner_extractor',
    'app.text_intelligence.regex_extractor',
    'app.text_intelligence.event_extractor',
    'app.text_intelligence.entity_linker',
    'app.text_intelligence.worker',
    'app.image_worker.captioner',
    'app.image_worker.text_detector',
    'app.image_worker.evidence_builder',
    'app.image_worker.metadata_extractor',
    'app.image_worker.preprocessor',
    'app.image_worker.worker',
    'app.ocr_worker.engine',
    'app.ocr_worker.translator',
    'app.ocr_worker.worker',
    'app.pdf_worker.worker',
    'app.audio_worker.worker',
    'app.fusion.fusion_engine',
    'app.fusion.entity_merger',
    'app.fusion.event_merger',
    'app.schemas.fusion',
    'app.schemas.text_intelligence',
    'app.timeline.engine',
    'app.timeline.normalizer',
    'app.timeline.deduplicator',
    'app.timeline_intelligence.engine',
    'app.schemas.timeline',
    'app.schemas.timeline_intelligence',
    'app.investigation_intelligence.engine',
    'app.schemas.investigation_intelligence',
    'app.schemas.evidence',
]

results = {}
for m in modules:
    try:
        importlib.import_module(m)
        results[m] = 'OK'
    except Exception as e:
        results[m] = traceback.format_exception_only(type(e), e)[0].strip()

print(json.dumps(results, indent=2))
