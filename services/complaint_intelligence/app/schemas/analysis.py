from typing import Optional, List
from pydantic import BaseModel, Field
from app.evidence.models.evidence_object import EvidenceObject


class PreprocessedData(BaseModel):
    original_text: str
    cleaned_text: str
    detected_language: str
    translated_text: str
    normalized_text: str


class ComplaintAnalyzeResponse(BaseModel):
    message: str
    preprocessed: Optional[PreprocessedData] = None
    evidence: List[EvidenceObject] = Field(default_factory=list)


