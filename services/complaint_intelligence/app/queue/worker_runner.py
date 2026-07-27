"""
AnalysisWorker — background queue processor.
Polls the job queue, executes the corresponding workers, and writes back status/results.

Supported job types:
  IMAGE_WORKER      — captioning + OCR on a single image
  EVIDENCE_UPLOADED — full incremental evidence pipeline for a secure upload
                      (worker dispatch + EvidenceProfile persistence + LLM fusion)
"""
from __future__ import annotations

import asyncio
import base64
from typing import Any, Dict

from app.core.container import Container
from app.core.logging import logger
from app.image_worker.worker import ImageWorker
from app.queue.interface import IQueue
from app.queue.job import Job, JobType


class AnalysisWorker:
    """
    Background worker that polls Redis for queued jobs, processes them,
    and stores the results.
    """

    def __init__(self, queue: IQueue, container: Container, poll_interval: float = 1.0) -> None:
        self.queue = queue
        self.container = container
        self.poll_interval = poll_interval
        self._running = False
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("AnalysisWorker background runner started")

    async def stop(self) -> None:
        if not self._running:
            return
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("AnalysisWorker background runner stopped")

    async def _loop(self) -> None:
        while self._running:
            try:
                # Poll for all known job types in priority order
                job: Job | None = None
                for job_type in (
                    JobType.EVIDENCE_UPLOADED,
                    JobType.IMAGE_WORKER,
                ):
                    job = await self.queue.dequeue(job_type.value)
                    if job:
                        break

                if job:
                    logger.info(
                        "Retrieved job from queue",
                        extra={"job_id": job.job_id, "job_type": job.job_type},
                    )
                    await self._dispatch(job)
                else:
                    await asyncio.sleep(self.poll_interval)

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Error in AnalysisWorker loop", exc_info=exc)
                await asyncio.sleep(self.poll_interval)

    async def _dispatch(self, job: Job) -> None:
        """Route a job to its appropriate handler."""
        try:
            if job.job_type == JobType.IMAGE_WORKER:
                await self._handle_image_worker(job)

            elif job.job_type == JobType.EVIDENCE_UPLOADED:
                await self._handle_evidence_uploaded(job)

            else:
                logger.warning("Unknown job type, skipping", extra={"job_type": job.job_type})
                await self.queue.ack(job.job_id)

        except Exception as exc:
            logger.error(
                "Job dispatch failed",
                extra={"job_id": job.job_id, "error": str(exc)},
                exc_info=exc,
            )
            await self.queue.nack(job)

    # ── IMAGE_WORKER ──────────────────────────────────────────────────────────

    async def _handle_image_worker(self, job: Job) -> None:
        worker = ImageWorker(
            metadata_extractor=self.container.metadata_extractor,
            preprocessor=self.container.image_preprocessor,
            text_detector=self.container.text_detector,
            captioner=self.container.image_captioner,
            evidence_builder=self.container.evidence_builder,
            queue=self.queue,
        )
        result = await worker.run(
            payload=job.payload,
            attempt=job.attempt,
            job_id=job.job_id,
        )
        if result.succeeded:
            if result.output is not None:
                await self.queue.set_result(job.job_id, result.output)
            await self.queue.ack(job.job_id)
            logger.info("IMAGE_WORKER job succeeded", extra={"job_id": job.job_id})
        else:
            await self.queue.nack(job)
            logger.warning("IMAGE_WORKER job failed", extra={"job_id": job.job_id, "error": result.error})

    # ── EVIDENCE_UPLOADED ─────────────────────────────────────────────────────

    async def _handle_evidence_uploaded(self, job: Job) -> None:
        """
        Full incremental evidence pipeline for a secure-upload file:
          1. Decode file bytes from payload
          2. Run the appropriate media worker (image/audio/video/pdf/document)
          3. Save EvidenceProfile
          4. Trigger living CaseIntelligence fusion (single LLM call)
          5. Update EvidenceRecord processing status
          6. Ack job
        """
        payload: Dict[str, Any] = job.payload
        case_id: str = payload["case_id"]
        evidence_id: str = payload["evidence_id"]
        filename: str = payload["filename"]
        content_type: str = payload.get("content_type", "")
        file_bytes: bytes = base64.b64decode(payload["file_bytes_b64"])

        logger.info(
            "EVIDENCE_UPLOADED job starting",
            extra={"job_id": job.job_id, "evidence_id": evidence_id, "case_id": case_id},
        )

        # Update EvidenceRecord status → processing
        try:
            from app.schemas.upload_token import EvidenceProcessingStatus
            evidence_record_repo = self.container.evidence_record_repository
            await evidence_record_repo.update_status(evidence_id, EvidenceProcessingStatus.PROCESSING)
        except Exception as exc:
            logger.warning(
                "Failed to update EvidenceRecord to PROCESSING",
                extra={"evidence_id": evidence_id, "error": str(exc)},
            )

        try:
            orchestrator = self.container.incremental_pipeline_orchestrator
            ev_profile, _ = await orchestrator.process_incremental_evidence(
                case_id=case_id,
                filename=filename,
                content_type=content_type,
                file_bytes=file_bytes,
                evidence_id=evidence_id,
                force_reprocess=False,
                trigger_llm=True,
            )

            # Mark EvidenceRecord as completed
            try:
                await evidence_record_repo.mark_completed(evidence_id, url=ev_profile.url)
            except Exception as exc:
                logger.warning(
                    "Failed to mark EvidenceRecord as COMPLETED",
                    extra={"evidence_id": evidence_id, "error": str(exc)},
                )

            await self.queue.set_result(job.job_id, {"evidence_id": evidence_id, "case_id": case_id, "url": ev_profile.url})
            await self.queue.ack(job.job_id)
            logger.info(
                "EVIDENCE_UPLOADED job completed",
                extra={
                    "job_id": job.job_id,
                    "evidence_id": evidence_id,
                    "media_type": ev_profile.media_type,
                },
            )

        except Exception as exc:
            # Update EvidenceRecord status → failed
            try:
                from app.schemas.upload_token import EvidenceProcessingStatus
                evidence_record_repo = self.container.evidence_record_repository
                await evidence_record_repo.update_status(
                    evidence_id, EvidenceProcessingStatus.FAILED, error=str(exc)
                )
            except Exception:
                pass

            logger.error(
                "EVIDENCE_UPLOADED job failed",
                extra={"job_id": job.job_id, "evidence_id": evidence_id, "error": str(exc)},
                exc_info=exc,
            )
            await self.queue.nack(job)
