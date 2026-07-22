"""
VideoWorker — orchestrates the full video processing pipeline (M7).

Architectural principle:
  VideoWorker is a COORDINATOR. It NEVER implements Florence-2, OCR, or
  Whisper logic directly. It delegates all image understanding to ImageWorker
  and all audio understanding to AudioWorker — both of which are injected
  as constructor dependencies.

Pipeline steps (with structured log at every stage):
  1.  Decode video bytes (base64) + validate non-empty
  2.  Write to temp file (OpenCV / PySceneDetect require a file path)
  3.  Extract VideoMetadata (deterministic — OpenCV + mutagen)
  4.  Detect scenes (PySceneDetect ContentDetector)
  5.  Extract keyframes (OpenCV — start/middle/end per scene, configurable)
  6.  Extract audio track (moviepy → WAV bytes, or None if no audio)
  7.  Run ImageWorker.run() on each keyframe (in-process, no queue round-trip)
  8.  Run AudioWorker.run() on audio track (in-process, if audio present)
  9.  Aggregate results → VideoWorkerOutput
 10.  Clean up temp file (always, in finally block)

Retry strategy (matches project rules):
  - Transient: OpenCV errors, scene detection failures → retryable
  - Non-retryable: empty payload, missing key → raises ValueError immediately

Payload schema:
    {
        "video_bytes_b64": str,   # base64-encoded video bytes
        "file_name": str,         # original filename
        "file_size_bytes": int,   # original file size
    }
"""
from __future__ import annotations

import base64
import os
import tempfile
import uuid

from app.audio_worker.worker import AudioWorker
from app.base.worker import BaseWorker, ProgressUpdate
from app.core.config import settings
from app.core.logging import logger
from app.image_worker.worker import ImageWorker
from app.schemas.evidence import EvidenceProfile
from app.schemas.video import FrameType, VideoFrameProfile, VideoWorkerOutput
from app.video_worker.interfaces import (
    ExtractedKeyframe,
    FramePosition,
    IAudioExtractor,
    IKeyframeExtractor,
    ISceneDetector,
    IVideoMetadataExtractor,
)


class VideoWorker(BaseWorker[dict, dict]):
    """
    Coordinates video evidence processing.

    ImageWorker and AudioWorker are injected — VideoWorker has no direct
    knowledge of Florence-2, Whisper, or OCR. It only handles:
      - video decoding
      - scene detection
      - keyframe extraction
      - audio extraction
      - delegating to ImageWorker and AudioWorker
      - aggregating outputs into VideoWorkerOutput
    """

    worker_name = "video_worker"

    def __init__(
        self,
        scene_detector: ISceneDetector,
        keyframe_extractor: IKeyframeExtractor,
        audio_extractor: IAudioExtractor,
        video_metadata_extractor: IVideoMetadataExtractor,
        image_worker: ImageWorker,
        audio_worker: AudioWorker,
        frames_per_scene: int | None = None,
    ) -> None:
        super().__init__()
        self._scene_detector = scene_detector
        self._keyframe_extractor = keyframe_extractor
        self._audio_extractor = audio_extractor
        self._video_metadata_extractor = video_metadata_extractor
        self._image_worker = image_worker
        self._audio_worker = audio_worker
        self._frames_per_scene = frames_per_scene or settings.VIDEO_KEYFRAMES_PER_SCENE

    async def process(self, *, job_id: str, payload: dict, attempt: int) -> dict:
        file_name: str = payload.get("file_name", "upload.mp4")
        file_size_bytes: int = payload.get("file_size_bytes", 0)
        video_b64: str | None = payload.get("video_bytes_b64")

        logger.info(
            "[video_worker] Worker started",
            extra={"job_id": job_id, "file_name": file_name, "attempt": attempt},
        )

        # ── Step 1: Decode & validate ────────────────────────────────────────
        if not video_b64:
            raise ValueError("Payload must contain 'video_bytes_b64'.")
        try:
            video_bytes = base64.b64decode(video_b64)
        except Exception as exc:
            raise ValueError(f"Failed to decode video bytes: {exc}") from exc
        if not video_bytes:
            raise ValueError("Video payload is empty.")

        # ── Step 2: Write to temp file ───────────────────────────────────────
        ext = "." + file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ".mp4"
        tmp_path: str | None = None
        try:
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp.write(video_bytes)
                tmp_path = tmp.name

            logger.info(
                "[video_worker] Video written to temp file",
                extra={"job_id": job_id, "tmp_path": tmp_path, "bytes": len(video_bytes)},
            )

            return await self._process_file(
                job_id=job_id,
                tmp_path=tmp_path,
                file_name=file_name,
                file_size_bytes=file_size_bytes,
                attempt=attempt,
            )
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

    async def _process_file(
        self,
        *,
        job_id: str,
        tmp_path: str,
        file_name: str,
        file_size_bytes: int,
        attempt: int,
    ) -> dict:
        evidence_id = str(uuid.uuid4())

        # ── Step 3: Extract video metadata ───────────────────────────────────
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="metadata_extraction", percent=0.05, message="Extracting video metadata")
        )
        video_metadata = self._video_metadata_extractor.extract(tmp_path, file_name, file_size_bytes)
        logger.info(
            "[video_worker] Metadata extracted",
            extra={
                "job_id": job_id,
                "duration_seconds": video_metadata.duration_seconds,
                "fps": video_metadata.fps,
                "resolution": f"{video_metadata.width}x{video_metadata.height}",
                "has_audio": video_metadata.has_audio,
            },
        )

        # ── Step 4: Scene detection ───────────────────────────────────────────
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="scene_detection", percent=0.15, message="Detecting scenes")
        )
        scenes = self._scene_detector.detect(tmp_path)
        logger.info(
            "[video_worker] Scene detection completed",
            extra={"job_id": job_id, "num_scenes": len(scenes)},
        )

        # ── Step 5: Keyframe extraction ───────────────────────────────────────
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="keyframe_extraction", percent=0.25, message="Extracting keyframes")
        )
        keyframes = self._keyframe_extractor.extract(tmp_path, scenes, self._frames_per_scene)
        logger.info(
            "[video_worker] Keyframe extraction completed",
            extra={"job_id": job_id, "total_keyframes": len(keyframes)},
        )

        # ── Step 6: Audio extraction ──────────────────────────────────────────
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="audio_extraction", percent=0.35, message="Extracting audio track")
        )
        audio_bytes: bytes | None = self._audio_extractor.extract(tmp_path)
        logger.info(
            "[video_worker] Audio extraction completed",
            extra={"job_id": job_id, "has_audio": audio_bytes is not None},
        )

        # ── Step 7: ImageWorker per keyframe ──────────────────────────────────
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="image_processing", percent=0.45, message="Running ImageWorker on keyframes")
        )
        frame_profiles: list[VideoFrameProfile] = []
        successful = 0
        failed = 0

        for i, kf in enumerate(keyframes):
            kf_job_id = f"{job_id}_kf_{kf.scene.scene_index}_{kf.frame_position.value}"
            kf_payload = {
                "image_bytes_b64": base64.b64encode(kf.frame_bytes).decode("utf-8"),
                "file_name": f"{file_name}_scene{kf.scene.scene_index}_{kf.frame_position.value}.jpg",
                "file_size_bytes": len(kf.frame_bytes),
            }
            kf_result = await self._image_worker.run(kf_payload, job_id=kf_job_id)

            if kf_result.succeeded and kf_result.output:
                frame_profiles.append(
                    VideoFrameProfile(
                        scene_index=kf.scene.scene_index,
                        frame_type=FrameType(kf.frame_position.value),
                        timestamp_s=kf.timestamp_s,
                        image_job_id=kf_job_id,
                        evidence_profile=kf_result.output,
                    )
                )
                successful += 1
                logger.info(
                    "[video_worker] Keyframe processed",
                    extra={
                        "job_id": job_id,
                        "kf_job_id": kf_job_id,
                        "scene_index": kf.scene.scene_index,
                        "frame_position": kf.frame_position.value,
                    },
                )
            else:
                failed += 1
                logger.warning(
                    "[video_worker] Keyframe processing failed",
                    extra={
                        "job_id": job_id,
                        "kf_job_id": kf_job_id,
                        "scene_index": kf.scene.scene_index,
                        "error": kf_result.error,
                    },
                )

        logger.info(
            "[video_worker] All keyframes processed",
            extra={"job_id": job_id, "successful": successful, "failed": failed},
        )

        # ── Step 8: AudioWorker for audio track ───────────────────────────────
        audio_output: dict | None = None
        if audio_bytes:
            self.report_progress(
                ProgressUpdate(job_id=job_id, step="audio_processing", percent=0.85, message="Running AudioWorker on audio track")
            )
            audio_job_id = f"{job_id}_audio"
            audio_payload = {
                "audio_bytes_b64": base64.b64encode(audio_bytes).decode("utf-8"),
                "file_name": f"{file_name}_audio.wav",
                "file_size_bytes": len(audio_bytes),
                "evidence_id": evidence_id,
            }
            audio_result = await self._audio_worker.run(audio_payload, job_id=audio_job_id)
            if audio_result.succeeded and audio_result.output:
                audio_output = audio_result.output
                logger.info("[video_worker] AudioWorker completed", extra={"job_id": job_id, "audio_job_id": audio_job_id})
            else:
                logger.warning(
                    "[video_worker] AudioWorker failed",
                    extra={"job_id": job_id, "error": audio_result.error},
                )
        else:
            logger.info("[video_worker] No audio track — skipping AudioWorker", extra={"job_id": job_id})

        # ── Step 9: Build output ──────────────────────────────────────────────
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="completed", percent=1.0, message="Video processing complete")
        )
        status = "complete" if failed == 0 else "partial"
        output = VideoWorkerOutput(
            video_job_id=job_id,
            evidence_id=evidence_id,
            video_file_name=file_name,
            video_metadata=video_metadata,
            scenes=scenes,
            frame_profiles=frame_profiles,
            audio_output=audio_output,
            status=status,
            total_keyframes_processed=successful + failed,
        )
        logger.info(
            "[video_worker] Processing completed",
            extra={
                "job_id": job_id,
                "status": status,
                "num_scenes": len(scenes),
                "frame_profiles": len(frame_profiles),
                "has_audio_output": audio_output is not None,
            },
        )
        return output.model_dump(mode="json")
