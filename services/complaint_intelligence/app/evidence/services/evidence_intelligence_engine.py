from typing import List
from app.core.logging import logger
from app.schemas.complaint import EvidenceItem
from app.evidence.context import EvidenceContext
from app.evidence.pipeline import EvidencePipeline
from app.evidence.processors.metadata_processor import MetadataProcessor
from app.evidence.builders.evidence_builder import EvidenceBuilder
from app.evidence.models.evidence_object import EvidenceObject


class EvidenceIntelligenceEngine:
    """
    Coordinates evidence processing. Instantiates the processing pipeline,
    manages temporary directories/files, and builds structured EvidenceObjects.
    """

    def __init__(self):
        from app.evidence.processors.ocr_processor import OCRProcessor
        from app.evidence.processors.vision_processor import VisionProcessor
        from app.evidence.processors.classification_processor import ClassificationProcessor

        self.processors = [
            MetadataProcessor(),
            OCRProcessor(),
            VisionProcessor(),
            ClassificationProcessor()
        ]
        self.pipeline = EvidencePipeline(self.processors)

    async def process_evidence_list(self, items: List[EvidenceItem]) -> List[EvidenceObject]:
        """
        Processes a list of incoming EvidenceItems through the pipeline,
        returning their corresponding EvidenceObjects.
        """
        logger.info(f"EvidenceIntelligenceEngine: Received {len(items)} evidence items to process.")
        results = []

        for item in items:
            context = EvidenceContext(item)
            try:
                # Execute pipeline
                processed_context = await self.pipeline.execute(context)

                # Build finalized EvidenceObject
                evidence_obj = EvidenceBuilder.build(processed_context)
                results.append(evidence_obj)

                # Manage temporary file cleanup
                if processed_context.temp_file_path and processed_context.temp_file_path.exists():
                    try:
                        processed_context.temp_file_path.unlink()
                        logger.info(f"EvidenceIntelligenceEngine: Cleaned up temp file '{processed_context.temp_file_path}'")
                    except Exception as cleanup_err:
                        logger.warning(
                            f"EvidenceIntelligenceEngine: Failed to delete temp file '{processed_context.temp_file_path}': {cleanup_err}"
                        )
            except Exception as exc:
                logger.error(
                    f"EvidenceIntelligenceEngine: Unhandled error processing {item.original_filename}: {exc}",
                    exc_info=True,
                )
                context.processing_status = "FAILED"
                context.errors.append(f"Engine execution error: {str(exc)}")
                results.append(EvidenceBuilder.build(context))

        return results
