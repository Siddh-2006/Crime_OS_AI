"""
PDF Worker — metadata extractor implementations (M8).

PyMuPDFMetadataExtractor:
  - Reads page_count, title, author, producer, creator, is_encrypted from fitz.Document.
  - Entirely deterministic — no AI.

MockPDFMetadataExtractor:
  - Returns fixed PDFMetadata for unit tests, no file I/O.
"""
from __future__ import annotations

from app.pdf_worker.interfaces import IPDFMetadataExtractor
from app.schemas.evidence import PDFMetadata


class PyMuPDFMetadataExtractor(IPDFMetadataExtractor):
    """Extracts PDF document metadata using pymupdf (fitz)."""

    def extract(
        self,
        pdf_bytes: bytes,
        file_name: str,
        file_size_bytes: int,
    ) -> PDFMetadata:
        import fitz  # type: ignore[import-untyped]

        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        except Exception as exc:
            raise ValueError(f"pymupdf could not open PDF '{file_name}': {exc}") from exc

        try:
            meta = doc.metadata or {}
            is_encrypted = doc.is_encrypted
            page_count = len(doc)
        finally:
            doc.close()

        return PDFMetadata(
            page_count=page_count,
            file_size_bytes=file_size_bytes,
            mime_type="application/pdf",
            title=meta.get("title") or None,
            author=meta.get("author") or None,
            producer=meta.get("producer") or None,
            creator=meta.get("creator") or None,
            is_encrypted=bool(is_encrypted),
        )


class MockPDFMetadataExtractor(IPDFMetadataExtractor):
    """Returns a fixed PDFMetadata for unit tests — no file I/O."""

    def __init__(self, result: PDFMetadata | None = None) -> None:
        self._result = result or PDFMetadata(
            page_count=2,
            file_size_bytes=50_000,
            mime_type="application/pdf",
            title="Test Document",
            author="Test Author",
            producer="Test Producer",
            creator=None,
            is_encrypted=False,
        )

    def extract(
        self,
        pdf_bytes: bytes,
        file_name: str,
        file_size_bytes: int,
    ) -> PDFMetadata:
        return self._result
