from pydantic import BaseModel, Field
from typing import List, Optional


class EvidenceItem(BaseModel):
    public_id: str = Field(..., alias="publicId")
    secure_url: str = Field(..., alias="secureUrl")
    resource_type: str = Field(..., alias="resourceType")
    mime_type: str = Field(..., alias="mimeType")
    original_filename: str = Field(..., alias="originalFilename")
    extension: str
    size: int

    class Config:
        populate_by_name = True


class ComplaintAnalyzeRequest(BaseModel):
    complaint_id: str = Field(..., alias="complaintId")
    detailed_description: str = Field(..., alias="detailedDescription")
    short_description: Optional[str] = Field(None, alias="shortDescription")
    evidence: List[EvidenceItem] = Field(default_factory=list)

    class Config:
        populate_by_name = True
