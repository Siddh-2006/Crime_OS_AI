"""
Shared test utilities for PDF worker tests (M8).

Provides:
  - FAKE_PDF_BYTES: Minimal PDF header bytes (enough to pass MIME/size validation)
  - EMPTY_PDF_BYTES: Zero-length bytes
  - NOT_PDF_BYTES: Garbage bytes
  - mock worker factories
"""
from __future__ import annotations

# Minimal valid PDF header structure (%PDF-1.4 ...)
FAKE_PDF_BYTES: bytes = (
    b"%PDF-1.4\n"
    b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
    b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
    b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj\n"
    b"xref\n0 4\n0000000000 65535 f \n"
    b"trailer << /Size 4 /Root 1 0 R >>\n"
    b"startxref\n190\n%%EOF\n"
)

EMPTY_PDF_BYTES: bytes = b""
NOT_PDF_BYTES: bytes = b"not a pdf file content\xde\xad\xbe\xef"


from app.ocr_worker.interfaces import IOCREngine
from app.schemas.ocr import BoundingBox, OCRLine, OCRResult


class MockOCREngine(IOCREngine):
    """Mock IOCREngine for unit tests."""

    def __init__(self, result: OCRResult | None = None) -> None:
        self._result = result or OCRResult(
            raw_text="Extracted OCR text from scanned page.",
            average_confidence=0.95,
            lines=[
                OCRLine(
                    text="Extracted OCR text from scanned page.",
                    confidence=0.95,
                    bounding_box=BoundingBox(x1=0.0, y1=0.0, x2=100.0, y2=20.0),
                )
            ],
            processing_duration_ms=10.0,
        )

    async def run(self, image_bytes: bytes) -> OCRResult:
        return self._result
