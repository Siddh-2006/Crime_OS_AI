from typing import List
from app.evidence.context import EvidenceContext
from app.evidence.interfaces import EvidenceProcessor
from app.core.logging import logger


class EvidencePipeline:
    """
    Sequentially runs all registered EvidenceProcessors on the shared EvidenceContext.
    If a processor fails, it captures the error in the context and sets its status to FAILED,
    but lets subsequent processors execute if appropriate.
    """

    def __init__(self, processors: List[EvidenceProcessor]):
        self.processors = processors

    async def execute(self, context: EvidenceContext) -> EvidenceContext:
        logger.info(
            "Executing evidence pipeline",
            extra={
                "original_filename": context.item.original_filename,
                "public_id": context.item.public_id,
                "processors": [p.__class__.__name__ for p in self.processors],
            },
        )
        for processor in self.processors:
            processor_name = processor.__class__.__name__
            try:
                logger.debug(f"Running processor: {processor_name}")
                context = await processor.process(context)
            except Exception as e:
                logger.error(
                    f"Processor {processor_name} failed: {e}",
                    extra={"original_filename": context.item.original_filename},
                    exc_info=True,
                )
                context.errors.append(f"Processor {processor_name} error: {str(e)}")
                context.processing_status = "FAILED"

        return context
