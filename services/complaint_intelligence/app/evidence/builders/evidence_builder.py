from app.evidence.context import EvidenceContext
from app.evidence.models.evidence_object import (
    AIMetadata,
    EvidenceMetadataDict,
    EvidenceObject,
)


class EvidenceBuilder:
    """
    Builder responsible for mapping a mutable EvidenceContext into a structured,
    standardized EvidenceObject.
    """

    @staticmethod
    def build(context: EvidenceContext) -> EvidenceObject:
        metadata = EvidenceMetadataDict(
            width=context.width,
            height=context.height,
            fileType=context.file_type,
            fileSize=context.file_size,
            exif=context.exif,
            gps=context.gps,
        )

        ai_metadata = AIMetadata(
            ocrText=context.ocr_text,
            ocrConfidence=context.ocr_confidence,
            imageTags=context.image_tags,
            detectedObjects=[],  # Staged for future YOLO processor
            processingErrors=context.errors,
        )

        return EvidenceObject(
            publicId=context.item.public_id,
            secureUrl=context.item.secure_url,
            resourceType=context.item.resource_type,
            mimeType=context.item.mime_type,
            originalFilename=context.item.original_filename,
            extension=context.item.extension,
            size=context.item.size,
            processingStatus=context.processing_status,
            classification=context.classification,
            classificationConfidence=context.classification_confidence,
            metadata=metadata,
            aiMetadata=ai_metadata,
        )
