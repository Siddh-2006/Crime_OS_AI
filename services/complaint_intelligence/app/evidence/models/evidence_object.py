from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class EvidenceMetadataDict(BaseModel):
    width: Optional[int] = None
    height: Optional[int] = None
    file_type: str = Field(..., alias="fileType")
    file_size: int = Field(..., alias="fileSize")
    exif: Dict[str, Any] = Field(default_factory=dict)
    gps: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        populate_by_name = True


class AIMetadata(BaseModel):
    ocr_text: Optional[str] = Field(None, alias="ocrText")
    ocr_confidence: Optional[float] = Field(None, alias="ocrConfidence")
    image_tags: List[str] = Field(default_factory=list, alias="imageTags")
    detected_objects: List[str] = Field(default_factory=list, alias="detectedObjects")
    processing_errors: List[str] = Field(default_factory=list, alias="processingErrors")

    class Config:
        populate_by_name = True


class EvidenceObject(BaseModel):
    public_id: str = Field(..., alias="publicId")
    secure_url: str = Field(..., alias="secureUrl")
    resource_type: str = Field(..., alias="resourceType")
    mime_type: str = Field(..., alias="mimeType")
    original_filename: str = Field(..., alias="originalFilename")
    extension: str
    size: int
    processing_status: str = Field(..., alias="processingStatus")
    classification: Optional[str] = Field(None, alias="classification")
    classification_confidence: Optional[float] = Field(None, alias="classificationConfidence")
    metadata: EvidenceMetadataDict
    ai_metadata: AIMetadata = Field(..., alias="aiMetadata")

    class Config:
        populate_by_name = True
