from pathlib import Path
from typing import Any, Dict, List, Optional
from app.schemas.complaint import EvidenceItem


class EvidenceContext:
    """
    Mutable context that holds the intermediate and final results of processing
    a single Citizen's EvidenceItem.
    """

    def __init__(self, item: EvidenceItem):
        self.item = item
        self.temp_file_path: Optional[Path] = None

        # Basic metadata
        self.width: Optional[int] = None
        self.height: Optional[int] = None
        self.file_type: str = "UNKNOWN"
        self.file_size: int = item.size
        self.exif: Dict[str, Any] = {}
        self.gps: Dict[str, Any] = {}

        # AI-extracted metadata (for Phase 3B onwards)
        self.ocr_text: Optional[str] = None
        self.ocr_confidence: Optional[float] = None
        self.image_tags: List[str] = []

        # Document/Evidence Classification (for Phase 3C onwards)
        self.classification: Optional[str] = None
        self.classification_confidence: Optional[float] = None

        # Processing state
        self.processing_status: str = "PENDING"
        self.errors: List[str] = []
