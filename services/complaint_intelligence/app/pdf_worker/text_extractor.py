"""
PDF Worker — text extractor implementations (M8).

PyMuPDFTextExtractor:
  - Uses fitz (pymupdf) to extract embedded text per page.
  - Returns empty string for image-only (scanned) pages.

MockPDFTextExtractor:
  - Returns configurable text without opening any PDF.
  - Supports per-page configuration for testing mixed digital/scanned PDFs.
"""
from __future__ import annotations

from app.pdf_worker.interfaces import IPDFTextExtractor


class PyMuPDFTextExtractor(IPDFTextExtractor):
    """
    Production text extractor backed by pymupdf (fitz).

    Extracts embedded text layer from each page. Returns an empty string
    for pages that contain only images (scanned pages).
    """

    def extract(self, pdf_bytes: bytes, page_index: int) -> str:
        import fitz  # type: ignore[import-untyped]  # pymupdf

        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        except Exception as exc:
            raise ValueError(f"pymupdf could not open PDF: {exc}") from exc

        try:
            if page_index >= len(doc):
                raise ValueError(
                    f"Page index {page_index} out of range for {len(doc)}-page PDF."
                )
            page = doc[page_index]
            return page.get_text("text") or ""
        finally:
            doc.close()

    def page_count(self, pdf_bytes: bytes) -> int:
        import fitz  # type: ignore[import-untyped]

        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            count = len(doc)
            doc.close()
            return count
        except Exception as exc:
            raise ValueError(f"pymupdf could not open PDF: {exc}") from exc


class MockPDFTextExtractor(IPDFTextExtractor):
    """
    Deterministic text extractor for unit tests.
    Returns configurable text per page without reading any PDF.

    Args:
        pages_text: List of strings, one per page. Defaults to
                    ["This is digital text on page 0."].
        total_pages: Override the page count (defaults to len(pages_text)).
    """

    def __init__(
        self,
        pages_text: list[str] | None = None,
        total_pages: int | None = None,
    ) -> None:
        self._pages_text = pages_text or ["This is digital text on page 0."]
        self._total_pages = total_pages or len(self._pages_text)

    def extract(self, pdf_bytes: bytes, page_index: int) -> str:
        if page_index >= len(self._pages_text):
            return ""
        return self._pages_text[page_index]

    def page_count(self, pdf_bytes: bytes) -> int:
        return self._total_pages
