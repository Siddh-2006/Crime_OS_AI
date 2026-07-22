"""
PDF Worker — page renderer implementations (M8).

PyMuPDFPageRenderer:
  - Uses fitz (pymupdf) to rasterize PDF pages to JPEG bytes.
  - DPI configurable (default 150 — good OCR quality without OOM risk).

MockPDFPageRenderer:
  - Returns a PIL-generated 4×4 white JPEG that PIL and PaddleOCR can decode.
  - No fitz, no file I/O in tests.
"""
from __future__ import annotations

from app.pdf_worker.interfaces import IPDFPageRenderer


def _make_placeholder_jpeg() -> bytes:
    """Generate a minimal valid JPEG (4×4 white) using PIL."""
    import io as _io
    from PIL import Image
    img = Image.new("RGB", (4, 4), color=(255, 255, 255))
    buf = _io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


_PLACEHOLDER_JPEG: bytes = _make_placeholder_jpeg()


class PyMuPDFPageRenderer(IPDFPageRenderer):
    """
    Production page renderer backed by pymupdf.

    Renders a PDF page to JPEG bytes at the specified DPI.
    Used for scanned pages that need to be sent to OCRWorker.
    """

    def render(self, pdf_bytes: bytes, page_index: int, dpi: int = 150) -> bytes:
        import fitz  # type: ignore[import-untyped]
        import io

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
            # mat scales the page to the target DPI (72 is pymupdf's native DPI)
            mat = fitz.Matrix(dpi / 72, dpi / 72)
            pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
            return pix.tobytes("jpeg")
        finally:
            doc.close()


class MockPDFPageRenderer(IPDFPageRenderer):
    """
    Deterministic page renderer for unit tests.
    Returns a valid JPEG that PIL/PaddleOCR can decode, without rendering any PDF.
    """

    def __init__(self, jpeg_bytes: bytes | None = None) -> None:
        self._jpeg_bytes = jpeg_bytes or _PLACEHOLDER_JPEG

    def render(self, pdf_bytes: bytes, page_index: int, dpi: int = 150) -> bytes:
        return self._jpeg_bytes
