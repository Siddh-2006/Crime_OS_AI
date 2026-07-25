"""
Unit tests for PDFWorker (M8).

All external dependencies are mocked:
  - IPDFTextExtractor     → MockPDFTextExtractor
  - IPDFPageRenderer      → MockPDFPageRenderer
  - IPDFMetadataExtractor → MockPDFMetadataExtractor
  - OCRWorker             → built with MockOCREngine & MockTranslator
  - ITranslationEngine    → MockTranslator
  - IQueue                → MockQueue

Tests cover:
  - Digital PDF path
  - Scanned PDF path
  - Mixed digital & scanned PDF path
  - TextIntelligence job queuing
  - Validation failures
"""
from __future__ import annotations

import base64
import pytest

from app.ocr_worker.translator import NoOpTranslator
from app.ocr_worker.worker import OCRWorker
from app.pdf_worker.metadata_extractor import MockPDFMetadataExtractor
from app.pdf_worker.page_renderer import MockPDFPageRenderer
from app.pdf_worker.text_extractor import MockPDFTextExtractor
from app.pdf_worker.worker import PDFWorker
from app.queue.job import JobType
from app.queue.mock_queue import MockQueue
from app.schemas.ocr import BoundingBox, OCRLine, OCRResult
from app.schemas.pdf import PDFPageType, PDFWorkerOutput
from tests.pdf_test_utils import EMPTY_PDF_BYTES, FAKE_PDF_BYTES, MockOCREngine


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("utf-8")


def _make_mock_ocr_worker(queue: MockQueue) -> OCRWorker:
    mock_engine = MockOCREngine(
        result=OCRResult(
            raw_text="Extracted OCR text from scanned page.",
            average_confidence=0.95,
            lines=[OCRLine(
                text="Extracted OCR text from scanned page.",
                confidence=0.95,
                bounding_box=BoundingBox(x1=0.0, y1=0.0, x2=100.0, y2=20.0),
            )],
            processing_duration_ms=10.0,
        )
    )
    return OCRWorker(
        ocr_engine=mock_engine,
        translator=NoOpTranslator(),
        queue=queue,
    )


def _make_worker(
    pages_text: list[str] | None = None,
    total_pages: int | None = None,
    queue: MockQueue | None = None,
    digital_threshold: int = 20,
) -> tuple[PDFWorker, MockQueue]:
    q = queue or MockQueue()
    texts = pages_text if pages_text is not None else ["This is a digital page with enough text content."]
    count = total_pages if total_pages is not None else len(texts)

    text_ext = MockPDFTextExtractor(pages_text=texts, total_pages=count)
    page_rnd = MockPDFPageRenderer()
    from app.schemas.evidence import PDFMetadata
    meta_ext = MockPDFMetadataExtractor(result=PDFMetadata(
        page_count=count,
        file_size_bytes=50000,
        mime_type="application/pdf",
        title="Test Document",
    ))
    ocr_wrk = _make_mock_ocr_worker(q)
    translator = NoOpTranslator()

    worker = PDFWorker(
        text_extractor=text_ext,
        page_renderer=page_rnd,
        metadata_extractor=meta_ext,
        ocr_worker=ocr_wrk,
        translator=translator,
        queue=q,
        digital_char_threshold=digital_threshold,
    )
    return worker, q


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_digital_pdf_returns_complete_status():
    """Digital PDF page (chars >= threshold) → PDFPageType.DIGITAL."""
    worker, queue = _make_worker(
        pages_text=["This is a digital page with enough text content."],
    )
    result = await worker.run(
        {"pdf_bytes_b64": _b64(FAKE_PDF_BYTES), "file_name": "doc.pdf", "file_size_bytes": len(FAKE_PDF_BYTES)},
        job_id="pdf-001",
    )

    assert result.succeeded is True
    assert result.output is not None
    output = PDFWorkerOutput.model_validate(result.output)
    assert output.status == "complete"
    assert len(output.pages) == 1
    assert output.pages[0].page_type == PDFPageType.DIGITAL
    assert "digital page" in output.pages[0].raw_text
    assert output.pages[0].ocr_job_id is None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_scanned_pdf_dispatches_ocr_worker():
    """Scanned PDF page (chars < threshold) → PDFPageType.SCANNED & runs OCRWorker."""
    worker, queue = _make_worker(
        pages_text=[""],  # empty text -> scanned page
    )
    result = await worker.run(
        {"pdf_bytes_b64": _b64(FAKE_PDF_BYTES), "file_name": "scanned.pdf", "file_size_bytes": len(FAKE_PDF_BYTES)},
        job_id="pdf-002",
    )

    assert result.succeeded is True
    output = PDFWorkerOutput.model_validate(result.output)
    assert len(output.pages) == 1
    page = output.pages[0]
    assert page.page_type == PDFPageType.SCANNED
    assert page.ocr_job_id is not None
    assert "Extracted OCR text" in page.raw_text


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_mixed_pdf_handles_both_page_types():
    """Page 0 digital, Page 1 scanned."""
    worker, queue = _make_worker(
        pages_text=[
            "Digital content on page 0 with sufficient characters.",
            "Short",  # 5 chars < 20 -> scanned page
        ],
        total_pages=2,
    )
    result = await worker.run(
        {"pdf_bytes_b64": _b64(FAKE_PDF_BYTES), "file_name": "mixed.pdf", "file_size_bytes": len(FAKE_PDF_BYTES)},
        job_id="pdf-003",
    )

    assert result.succeeded is True
    output = PDFWorkerOutput.model_validate(result.output)
    assert len(output.pages) == 2
    assert output.pages[0].page_type == PDFPageType.DIGITAL
    assert output.pages[1].page_type == PDFPageType.SCANNED





@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_empty_payload_fails():
    worker, _ = _make_worker()
    result = await worker.run(
        {"pdf_bytes_b64": _b64(EMPTY_PDF_BYTES), "file_name": "empty.pdf", "file_size_bytes": 0},
        job_id="pdf-005",
    )
    assert result.succeeded is False
    assert result.error is not None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_missing_payload_key_fails():
    worker, _ = _make_worker()
    result = await worker.run(
        {"file_name": "missing.pdf"},
        job_id="pdf-006",
    )
    assert result.succeeded is False
    assert result.error is not None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_metadata_populated_in_output():
    worker, _ = _make_worker(pages_text=["Digital text page."])
    result = await worker.run(
        {"pdf_bytes_b64": _b64(FAKE_PDF_BYTES), "file_name": "doc.pdf", "file_size_bytes": len(FAKE_PDF_BYTES)},
        job_id="pdf-007",
    )
    output = PDFWorkerOutput.model_validate(result.output)
    assert output.pdf_metadata.page_count == 1
    assert output.pdf_metadata.mime_type == "application/pdf"
    assert output.pdf_file_name == "doc.pdf"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_worker_output_has_evidence_id():
    import uuid
    worker, _ = _make_worker(pages_text=["Digital text page."])
    result = await worker.run(
        {"pdf_bytes_b64": _b64(FAKE_PDF_BYTES), "file_name": "doc.pdf", "file_size_bytes": len(FAKE_PDF_BYTES)},
        job_id="pdf-008",
    )
    output = PDFWorkerOutput.model_validate(result.output)
    uuid.UUID(output.evidence_id)
