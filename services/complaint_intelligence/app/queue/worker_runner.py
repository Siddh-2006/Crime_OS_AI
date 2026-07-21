"""
AnalysisWorker — background queue processor.
Polls the job queue, executes the corresponding workers, and writes back status/results.
"""
from __future__ import annotations

import asyncio

from app.core.container import Container
from app.core.logging import logger
from app.image_worker.worker import ImageWorker
from app.llm.worker import ComplaintProfileWorker
from app.queue.interface import IQueue
from app.queue.job import JobType
from app.text_intelligence.worker import TextIntelligenceWorker


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
                # Poll for all known job types
                for job_type in (
                    JobType.COMPLAINT_PROFILE,
                    JobType.TEXT_INTELLIGENCE,
                    JobType.IMAGE_WORKER,
                ):
                    job = await self.queue.dequeue(job_type.value)
                    if job:
                        break
                else:
                    job = None
                if job:
                    logger.info("Retrieved job from queue", extra={"job_id": job.job_id, "job_type": job.job_type})
                    # Dispatch to correct worker based on job type
                    if job.job_type == JobType.COMPLAINT_PROFILE:
                        worker = ComplaintProfileWorker(self.container.llm_client)
                    elif job.job_type == JobType.TEXT_INTELLIGENCE:
                        worker = TextIntelligenceWorker(
                            ner_extractor=self.container.ner_extractor,
                            regex_extractor=self.container.regex_extractor,
                            event_extractor=self.container.event_extractor,
                            entity_linker=self.container.entity_linker,
                        )
                    elif job.job_type == JobType.IMAGE_WORKER:
                        worker = ImageWorker(
                            metadata_extractor=self.container.metadata_extractor,
                            preprocessor=self.container.image_preprocessor,
                            text_detector=self.container.text_detector,
                            captioner=self.container.image_captioner,
                            evidence_builder=self.container.evidence_builder,
                            queue=self.queue,
                        )
                    else:
                        logger.warning("Unknown job type, skipping", extra={"job_type": job.job_type})
                        await self.queue.ack(job.job_id)
                        await asyncio.sleep(self.poll_interval)
                        continue
                    result = await worker.run(
                        payload=job.payload,
                        attempt=job.attempt,
                        job_id=job.job_id,
                    )

                    if result.succeeded:
                        # Save result and ack
                        if result.output is not None:
                            await self.queue.set_result(job.job_id, result.output)
                        await self.queue.ack(job.job_id)
                        logger.info("Job successfully processed and acked", extra={"job_id": job.job_id})
                    else:
                        # Nack job (handles retry logic automatically)
                        await self.queue.nack(job)
                        logger.warning(
                            "Job failed and nacked",
                            extra={"job_id": job.job_id, "error": result.error},
                        )
                else:
                    # No job, sleep for polling interval
                    await asyncio.sleep(self.poll_interval)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Error in AnalysisWorker loop", exc_info=exc)
                await asyncio.sleep(self.poll_interval)
