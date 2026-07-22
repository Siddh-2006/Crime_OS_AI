"""
AudioWorker — orchestrates the full audio processing pipeline (M6).

Steps (with structured log at every stage):
  1.  Decode audio bytes from base64 payload
  2.  Validate audio (non-empty)
  3.  Extract audio metadata (mutagen/pydub, deterministic)
  4.  Transcribe with Whisper (detect language + transcribe + translate if needed)
  5a. [Speech found]    → enqueue TEXT_INTELLIGENCE job → build AudioWorkerOutput(complete)
  5b. [No speech found] → build AudioWorkerOutput(no_speech) — no TI job enqueued

Retry strategy (matches project rules):
  - Transient: Whisper inference errors → retryable (exception propagates to BaseWorker)
  - Non-retryable: empty payload, invalid audio → raises ValueError immediately

Payload schema:
    {
        "audio_bytes_b64": str,   # base64-encoded audio bytes
        "file_name": str,         # original filename
        "file_size_bytes": int,   # original file size in bytes
        "evidence_id": str | None # optional — links to a parent evidence record
    }
"""
from __future__ import annotations

import base64
import uuid

from app.audio_worker.interfaces import IAudioMetadataExtractor, IAudioTranscriber
from app.base.worker import BaseWorker, ProgressUpdate
from app.core.logging import logger
from app.queue.interface import IQueue
from app.queue.job import Job, JobType
from app.schemas.audio import AudioWorkerOutput


class AudioWorker(BaseWorker[dict, dict]):
    """
    Orchestrates audio validation, metadata extraction, Whisper transcription,
    and Text Intelligence job enqueue.

    Implements BaseWorker[dict, dict] — input and output are both plain dicts
    (serialised to/from AudioWorkerOutput via model_dump / model_validate).
    """

    worker_name = "audio_worker"

    def __init__(
        self,
        transcriber: IAudioTranscriber,
        metadata_extractor: IAudioMetadataExtractor,
        queue: IQueue,
    ) -> None:
        super().__init__()
        self._transcriber = transcriber
        self._metadata_extractor = metadata_extractor
        self._queue = queue

    async def process(self, *, job_id: str, payload: dict, attempt: int) -> dict:
        file_name: str = payload.get("file_name", "upload.audio")
        file_size_bytes: int = payload.get("file_size_bytes", 0)
        evidence_id: str | None = payload.get("evidence_id")
        audio_b64: str | None = payload.get("audio_bytes_b64")

        logger.info(
            "[audio_worker] Worker started",
            extra={"job_id": job_id, "file_name": file_name, "attempt": attempt},
        )

        # ── Step 1: Decode & validate ────────────────────────────────────────
        if not audio_b64:
            raise ValueError("Payload must contain 'audio_bytes_b64'.")
        try:
            audio_bytes = base64.b64decode(audio_b64)
        except Exception as exc:
            raise ValueError(f"Failed to decode audio bytes: {exc}") from exc

        if not audio_bytes:
            raise ValueError("Audio payload is empty.")

        logger.info(
            "[audio_worker] Audio decoded",
            extra={"job_id": job_id, "bytes": len(audio_bytes)},
        )

        # ── Step 2: Extract metadata ─────────────────────────────────────────
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="metadata_extraction", percent=0.1, message="Extracting audio metadata")
        )
        audio_metadata = self._metadata_extractor.extract(audio_bytes, file_name, file_size_bytes)
        logger.info(
            "[audio_worker] Metadata extracted",
            extra={
                "job_id": job_id,
                "duration_seconds": audio_metadata.duration_seconds,
                "codec": audio_metadata.codec,
                "sample_rate": audio_metadata.sample_rate,
            },
        )

        # ── Step 3: Transcribe ───────────────────────────────────────────────
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="transcription", percent=0.3, message="Transcribing audio with Whisper")
        )
        logger.info("[audio_worker] Whisper transcription started", extra={"job_id": job_id})
        transcript = await self._transcriber.transcribe(audio_bytes)
        logger.info(
            "[audio_worker] Whisper transcription completed",
            extra={
                "job_id": job_id,
                "language": transcript.detected_language,
                "language_probability": transcript.language_probability,
                "segments": len(transcript.segments),
                "translated": transcript.translated_text is not None,
            },
        )

        # ── Step 4: Enqueue Text Intelligence job ────────────────────────────
        ti_text = transcript.translated_text or transcript.raw_text
        ti_job_id: str | None = None

        if ti_text.strip():
            self.report_progress(
                ProgressUpdate(job_id=job_id, step="ti_enqueue", percent=0.85, message="Enqueueing Text Intelligence job")
            )
            ti_job_id = str(uuid.uuid4())
            ti_payload = {
                "text": ti_text,
                "source": "audio",
                "file_name": file_name,
                "evidence_id": evidence_id,
                "audio_job_id": job_id,
            }
            ti_job = Job(
                job_type=JobType.TEXT_INTELLIGENCE,
                payload=ti_payload,
                correlation_id=job_id,
            )
            # Override job_id so we can reference it in the output
            ti_job = ti_job.model_copy(update={"job_id": ti_job_id})
            await self._queue.enqueue(ti_job)
            logger.info(
                "[audio_worker] Text Intelligence job enqueued",
                extra={"job_id": job_id, "ti_job_id": ti_job_id},
            )
            status = "complete"
        else:
            logger.info(
                "[audio_worker] No speech detected — skipping Text Intelligence enqueue",
                extra={"job_id": job_id},
            )
            status = "no_speech"

        # ── Step 5: Build output ─────────────────────────────────────────────
        self.report_progress(
            ProgressUpdate(job_id=job_id, step="completed", percent=1.0, message="Audio processing complete")
        )

        output = AudioWorkerOutput(
            audio_job_id=job_id,
            evidence_id=evidence_id or str(uuid.uuid4()),
            audio_file_name=file_name,
            audio_metadata=audio_metadata,
            transcript=transcript,
            text_intelligence_job_id=ti_job_id,
            status=status,
        )

        logger.info(
            "[audio_worker] Processing completed",
            extra={
                "job_id": job_id,
                "status": status,
                "ti_job_id": ti_job_id,
                "language": transcript.detected_language,
                "duration_seconds": audio_metadata.duration_seconds,
            },
        )
        return output.model_dump(mode="json")
