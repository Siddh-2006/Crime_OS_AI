"""
Run the Image Worker pipeline on all images in app/test-images/
using Florence-2 as a SEPARATE REST SERVICE at http://localhost:8002.

This is the production architecture (Option A):
  complaint_intelligence → POST http://localhost:8002/predict → Florence-2

Requires florence_service to be running:
    cd services/florence_service
    python app.py   (or uvicorn app:app --port 8002)
"""
import asyncio
import base64
import sys
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

from app.image_worker.captioner import FlorenceCaptioner
from app.image_worker.evidence_builder import EvidenceBuilder
from app.image_worker.metadata_extractor import PILMetadataExtractor
from app.image_worker.preprocessor import PILImagePreprocessor
from app.image_worker.text_detector import FlorenceTextDetector
from app.image_worker.worker import ImageWorker
from app.queue.mock_queue import MockQueue
from app.schemas.evidence import EvidenceProfile

FLORENCE_URL = "http://localhost:8002"


def _make_worker() -> ImageWorker:
    return ImageWorker(
        metadata_extractor=PILMetadataExtractor(),
        preprocessor=PILImagePreprocessor(max_dim=1024),
        text_detector=FlorenceTextDetector(base_url=FLORENCE_URL, timeout=120),
        captioner=FlorenceCaptioner(base_url=FLORENCE_URL, timeout=120),
        evidence_builder=EvidenceBuilder(),
        queue=MockQueue(),
    )


async def check_service():
    """Verify Florence-2 service is reachable before processing images."""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{FLORENCE_URL}/health")
            resp.raise_for_status()
            data = resp.json()
            print(f"  Florence-2 service: ONLINE  (model={data.get('model')}, device={data.get('device')})")
            return True
    except Exception as exc:
        print(f"  [ERROR] Florence-2 service not reachable at {FLORENCE_URL}: {exc}")
        print(f"  Start it with:  cd services/florence_service && python app.py")
        return False


async def analyse_image(image_path: Path, worker: ImageWorker):
    image_bytes = image_path.read_bytes()
    payload = {
        "image_bytes_b64": base64.b64encode(image_bytes).decode("utf-8"),
        "file_name": image_path.name,
        "file_size_bytes": len(image_bytes),
    }
    return await worker.run(payload, job_id=f"run-{image_path.stem[:20]}")


async def main():
    images_dir = ROOT / "app" / "test-images"
    images = sorted(f for f in images_dir.glob("*")
                    if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"))

    print(f"\n{'='*70}")
    print(f"  Crime OS -- Image Worker (Florence-2 REST Service)")
    print(f"  Service: {FLORENCE_URL}")
    print(f"{'='*70}\n")

    # Health check first
    if not await check_service():
        sys.exit(1)

    if not images:
        print("\n  No images found in app/test-images/")
        return

    print(f"\n  Processing {len(images)} image(s)...\n")
    worker = _make_worker()

    for idx, img_path in enumerate(images, 1):
        print(f"[{idx}/{len(images)}]  {img_path.name}  ({img_path.stat().st_size:,} bytes)")
        print(f"{'─'*60}")

        result = await analyse_image(img_path, worker)

        if not result.succeeded:
            print(f"  [FAIL]  {result.error}\n")
            continue

        profile = EvidenceProfile.model_validate(result.output)
        m = profile.image_metadata

        print(f"  Evidence ID   : {profile.evidence_id}")
        print(f"  Status        : {profile.status}")
        print(f"  Text Detected : {profile.text_detected}")
        if profile.text_detected:
            print(f"  OCR Job ID    : {profile.ocr_job_id}  (OCR_WORKER queued)")
        print(f"  Duration      : {profile.processing_duration_ms:.1f} ms")

        if m:
            print(f"\n  -- Image Metadata --")
            print(f"  Format        : {m.format}")
            print(f"  Dimensions    : {m.width} x {m.height} px")
            print(f"  Color Mode    : {m.color_mode}")
            print(f"  File Size     : {m.file_size_bytes:,} bytes")
            print(f"  MIME Type     : {m.mime_type}")
            if m.exif_timestamp:
                print(f"  EXIF Date     : {m.exif_timestamp}")
            if m.gps_coordinates:
                print(f"  GPS           : lat={m.gps_coordinates['lat']}, lon={m.gps_coordinates['lon']}")
            if m.camera_make:
                print(f"  Camera        : {m.camera_make} {m.camera_model or ''}")

        if profile.analysis:
            a = profile.analysis
            print(f"\n  -- Florence-2 Analysis (REAL) --")
            print(f"  Description   : {a.description}")
            print(f"  Scene Type    : {a.scene_type}")
            print(f"  Tags          : {', '.join(a.tags) if a.tags else 'none'}")
            print(f"  Confidence    : {a.confidence}")
            flags = [k for k, v in {
                "people": a.contains_people,
                "vehicles": a.contains_vehicles,
                "weapons": a.contains_weapons,
                "buildings": a.contains_buildings,
                "documents": a.contains_documents,
            }.items() if v]
            print(f"  Detected      : {', '.join(flags) if flags else 'none'}")

        print()

    print(f"{'='*70}")
    print(f"  [OK]  Processed {len(images)} image(s)")
    print(f"{'='*70}\n")


if __name__ == "__main__":
    asyncio.run(main())
