import asyncio, os, sys, importlib.util, warnings
warnings.filterwarnings("ignore")

if sys.platform == "win32":
    s = importlib.util.find_spec("torch")
    if s and s.origin:
        lib = os.path.join(os.path.dirname(s.origin), "lib")
        if os.path.isdir(lib): os.add_dll_directory(lib)
    import torch as _t  # noqa

sys.path.insert(0, ".")
from app.text_intelligence.ner_extractor import SpacyNERExtractor
from app.text_intelligence.regex_extractor import IndianRegexExtractor
from app.text_intelligence.event_extractor import TemporalEventExtractor
from app.text_intelligence.entity_linker import PassthroughEntityLinker
from app.text_intelligence.worker import TextIntelligenceWorker

TEXT = (
    "G Pay Payment Successful 25000 Paid to rajesh@ybl RAJESH KUMAR "
    "UPI Transaction ID 418925639847 18 July 2026 07:58 PM "
    "From Rahul Sharma rahulsharma123@sbi SBIN0004721 "
    "Reliance Digital Invoice No RD/26-27/44891 Date 02/02/2026 "
    "Samsung Galaxy IMEI 351234567890123 Amount Rs.1,24,999"
)

async def run():
    w = TextIntelligenceWorker(
        ner_extractor=SpacyNERExtractor(),
        regex_extractor=IndianRegexExtractor(),
        event_extractor=TemporalEventExtractor(),
        entity_linker=PassthroughEntityLinker(),
    )
    r = await w.run(payload={"text": TEXT, "source_type": "ocr"}, job_id="test-ner")
    if r.succeeded:
        ents = r.output.get("entities", [])
        evts = r.output.get("events", [])
        print(f"Entities extracted: {len(ents)}")
        for e in ents[:12]:
            print(f"  [{e['entity_type']}] {e['value']}  (confidence={e['confidence']:.2f})")
        print(f"Events: {len(evts)}")
        for ev in evts[:4]:
            print(f"  [{ev['timestamp']}] {ev['description'][:60]}")
    else:
        print("FAILED:", r.error)

asyncio.run(run())
