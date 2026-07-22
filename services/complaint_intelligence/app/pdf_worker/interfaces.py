"""
PDF Worker interfaces — M8.

Every concrete implementation must satisfy these contracts.
PDFWorker depends only on these ABCs, never on fitz (pymupdf) directly.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from app.schemas.evidence import PDFMetadata


class IPDFTextExtractor(ABC):
    """
    Extracts embedded text from a single PDF page.

    Responsibilities:
      - Open the PDF from bytes using pymupdf
      - Extract text from the specified page
      - Return raw text string (may be empty for scanned pages)
    """

    @abstractmethod
    def extract(self, pdf_bytes: bytes, page_index: int) -> str:
        """
        Extract text from a single PDF page.

        Args:
            pdf_bytes:  Raw PDF file bytes.
            page_index: Zero-based page index.

        Returns:
            Raw text string. Empty string if no text is embedded.

        Raises:
            ValueError: If the PDF cannot be opened or the page index is invalid.
        """
        ...

    @abstractmethod
    def page_count(self, pdf_bytes: bytes) -> int:
        """Return the number of pages in the PDF."""
        ...


class IPDFPageRenderer(ABC):
    """
    Renders a PDF page to JPEG image bytes (for scanned pages).

    Responsibilities:
      - Rasterize the specified page at the configured DPI
      - Return JPEG-encoded bytes ready for OCRWorker
    """

    @abstractmethod
    def render(self, pdf_bytes: bytes, page_index: int, dpi: int = 150) -> bytes:
        """
        Render a PDF page to JPEG bytes.

        Args:
            pdf_bytes:  Raw PDF file bytes.
            page_index: Zero-based page index.
            dpi:        Render resolution (higher = better OCR, slower).

        Returns:
            JPEG-encoded image bytes.

        Raises:
            ValueError: If the page cannot be rendered.
        """
        ...


class IPDFMetadataExtractor(ABC):
    """
    Extracts deterministic document metadata from a PDF file.

    Responsibilities:
      - Read page count, title, author, producer, creator, encryption status
      - Never use AI — entirely deterministic
    """

    @abstractmethod
    def extract(
        self,
        pdf_bytes: bytes,
        file_name: str,
        file_size_bytes: int,
    ) -> PDFMetadata:
        """
        Extract PDF document metadata.

        Args:
            pdf_bytes:       Raw PDF file bytes.
            file_name:       Original filename.
            file_size_bytes: Original file size.

        Returns:
            PDFMetadata populated from document headers.

        Raises:
            ValueError: If the file cannot be opened as a PDF.
        """
        ...
