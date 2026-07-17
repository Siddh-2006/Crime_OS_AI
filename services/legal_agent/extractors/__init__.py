from .existing_extractor import extract_pdf_pages as extract_pdf_pages_from_pdf
from .paddle_ocr_extractor import extract_pdf_pages as extract_pdf_pages_with_paddleocr

__all__ = ["extract_pdf_pages_from_pdf", "extract_pdf_pages_with_paddleocr"]
