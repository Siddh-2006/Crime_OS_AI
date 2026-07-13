from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from collections.abc import Mapping
from pathlib import Path
from typing import Any, Iterable

import numpy as np

from ingestion.extract_text import PageExtraction, TextLine, TextSpan, _clean_line, _require_fitz

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class OCRBlock:
    text: str
    confidence: float
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def center_x(self) -> float:
        return (self.x0 + self.x1) / 2.0

    @property
    def height(self) -> float:
        return max(self.y1 - self.y0, 0.0)


def _should_dump_page_trace(page_number: int) -> bool:
    return page_number == 2


def _describe_block(block: OCRBlock) -> str:
    return (
        f"text={block.text!r} conf={block.confidence:.3f} "
        f"box=({block.x0:.1f}, {block.y0:.1f}, {block.x1:.1f}, {block.y1:.1f})"
    )


def _describe_line_blocks(line: tuple[OCRBlock, ...]) -> str:
    return " | ".join(_describe_block(block) for block in line)


def _dump_page_trace(
    page_number: int,
    raw_blocks: list[OCRBlock],
    cleaned_blocks: list[OCRBlock],
    main_blocks: list[OCRBlock],
    marginal_summaries: list[OCRBlock],
    line_blocks: list[tuple[OCRBlock, ...]],
    paragraph_payloads: list[dict[str, Any]],
    paragraph_associations: list[dict[str, str]],
    lines: tuple[TextLine, ...],
) -> None:
    if not _should_dump_page_trace(page_number):
        return

    LOGGER.info("===== PAGE %s OCR TRACE START =====", page_number)
    LOGGER.info("Raw OCR blocks (%s)", len(raw_blocks))
    for index, block in enumerate(raw_blocks):
        LOGGER.info("page %s raw[%s]: %s", page_number, index, _describe_block(block))

    LOGGER.info("Cleaned OCR blocks (%s)", len(cleaned_blocks))
    for index, block in enumerate(cleaned_blocks):
        LOGGER.info("page %s cleaned[%s]: %s", page_number, index, _describe_block(block))

    LOGGER.info("Main content blocks (%s)", len(main_blocks))
    for index, block in enumerate(main_blocks):
        LOGGER.info("page %s main[%s]: %s", page_number, index, _describe_block(block))

    LOGGER.info("Marginal summary blocks (%s)", len(marginal_summaries))
    for index, block in enumerate(marginal_summaries):
        LOGGER.info("page %s marginal[%s]: %s", page_number, index, _describe_block(block))

    LOGGER.info("Reconstructed line groups (%s)", len(line_blocks))
    for index, line in enumerate(line_blocks):
        LOGGER.info("page %s line_group[%s]: %s", page_number, index, _describe_line_blocks(line))
        LOGGER.info("page %s line_group[%s] normalized_text=%r", page_number, index, _reconstruct_text_from_line(line))

    LOGGER.info("Reconstructed paragraphs (%s)", len(paragraph_payloads))
    for index, paragraph in enumerate(paragraph_payloads):
        paragraph_lines = paragraph.get("lines", ())
        LOGGER.info("page %s paragraph[%s] text=%r", page_number, index, paragraph.get("text", ""))
        for line_index, line in enumerate(paragraph_lines):
            LOGGER.info(
                "page %s paragraph[%s].line[%s]: %s",
                page_number,
                index,
                line_index,
                _describe_line_blocks(line),
            )

    LOGGER.info("Paragraph associations (%s)", len(paragraph_associations))
    for index, association in enumerate(paragraph_associations):
        LOGGER.info(
            "page %s association[%s]: paragraph=%r summary=%r",
            page_number,
            index,
            association.get("paragraph", ""),
            association.get("summary", ""),
        )

    LOGGER.info("Final normalized TextLine output (%s)", len(lines))
    for index, line in enumerate(lines):
        LOGGER.info("page %s output_line[%s]: %r", page_number, index, line.text)

    LOGGER.info("===== PAGE %s OCR TRACE END =====", page_number)


def _require_paddleocr():
    try:
        from paddleocr import PaddleOCR
    except Exception as exc:  # pragma: no cover - dependency missing
        raise RuntimeError(
            "PaddleOCR is required for OCR-based PDF extraction. Install paddleocr/paddlepaddle first."
        ) from exc
    return PaddleOCR


def _build_ocr_engine() -> Any:
    PaddleOCR = _require_paddleocr()
    candidate_kwargs = [
        {
            "lang": "en",
            "device": "cpu",
            "enable_mkldnn": False,
            "cpu_threads": 4,
        },
        {
            "lang": "en",
            "device": "cpu",
            "enable_mkldnn": False,
            "cpu_threads": 4,
            "use_textline_orientation": False,
        },
        {
            "lang": "en",
            "device": "cpu",
            "cpu_threads": 4,
        },
    ]
    last_error: Exception | None = None
    for kwargs in candidate_kwargs:
        try:
            LOGGER.info("Initializing PaddleOCR with %s", kwargs)
            return PaddleOCR(**kwargs)
        except (TypeError, ValueError, NotImplementedError) as exc:
            last_error = exc
            LOGGER.warning("PaddleOCR init failed with %s: %s", kwargs, exc)
            continue
    if last_error is not None:
        raise RuntimeError("Unable to initialize PaddleOCR with the supported local runtime options.") from last_error
    raise RuntimeError("Unable to initialize PaddleOCR.")


def _page_to_image(page: Any, scale: float = 1.2) -> np.ndarray:
    fitz = _require_fitz()
    pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    image = np.frombuffer(pixmap.samples, dtype=np.uint8)
    image = image.reshape(pixmap.height, pixmap.width, pixmap.n)
    if pixmap.n == 4:
        image = image[:, :, :3]
    return image


def _extract_poly_bounds(poly: Any) -> tuple[float, float, float, float] | None:
    if poly is None:
        return None

    try:
        values = list(poly)
    except Exception:
        return None

    if not values:
        return None

    # Support flat boxes like [x0, y0, x1, y1].
    if len(values) == 4 and not isinstance(values[0], (list, tuple, np.ndarray)):
        try:
            x0, y0, x1, y1 = (float(values[0]), float(values[1]), float(values[2]), float(values[3]))
        except Exception:
            return None
        return x0, y0, x1, y1

    try:
        xs = [float(point[0]) for point in values]
        ys = [float(point[1]) for point in values]
    except Exception:
        return None
    if not xs or not ys:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def _result_value(result: Any, key: str, default: Any = None) -> Any:
    if isinstance(result, Mapping):
        return result.get(key, default)
    getter = getattr(result, "get", None)
    if callable(getter):
        try:
            return getter(key, default)
        except TypeError:
            try:
                return getter(key)
            except Exception:
                return default
        except Exception:
            return default
    return getattr(result, key, default)


def _is_ocr_result_payload(result: Any) -> bool:
    texts = _result_value(result, "rec_texts", None)
    polys = _result_value(result, "rec_polys", None)
    boxes = _result_value(result, "rec_boxes", None)
    return texts is not None and (polys is not None or boxes is not None)


def _extract_ocr_result_blocks(result: Any) -> list[OCRBlock]:
    texts = list(_result_value(result, "rec_texts", []) or [])
    polys_source = _result_value(result, "rec_polys", None)
    if polys_source is None:
        polys_source = _result_value(result, "rec_boxes", [])
    polys = list(polys_source or [])
    scores = list(_result_value(result, "rec_scores", []) or [])

    LOGGER.info(
        "OCRResult payload sizes: rec_texts=%s rec_polys=%s rec_scores=%s",
        len(texts),
        len(polys),
        len(scores),
    )

    blocks: list[OCRBlock] = []
    for index, (text, poly) in enumerate(zip(texts, polys, strict=False)):
        bounds = _extract_poly_bounds(poly)
        if bounds is None:
            continue
        x0, y0, x1, y1 = bounds
        score = 0.0
        if index < len(scores):
            try:
                score = float(scores[index] or 0.0)
            except Exception:
                score = 0.0
        blocks.append(
            OCRBlock(
                text=str(text or ""),
                confidence=score,
                x0=x0,
                y0=y0,
                x1=x1,
                y1=y1,
            )
        )

    LOGGER.info("Detected OCR blocks: %s", len(blocks))
    return blocks


def _extract_raw_ocr_blocks(page_result: Any) -> list[OCRBlock]:
    LOGGER.info("OCR result type: %s", type(page_result).__name__)
    LOGGER.info("OCR result repr: %r", page_result)

    raw_items: list[Any]
    if page_result is None:
        raw_items = []
    elif isinstance(page_result, list):
        raw_items = page_result
    else:
        raw_items = [page_result]

    LOGGER.info("OCR raw_items count: %s", len(raw_items))
    for index, item in enumerate(raw_items[:3]):
        LOGGER.info("OCR raw_item[%s] type: %s", index, type(item).__name__)
        LOGGER.info("OCR raw_item[%s] repr: %r", index, item)

    blocks: list[OCRBlock] = []
    for item in raw_items:
        if _is_ocr_result_payload(item):
            LOGGER.info("Unwrapped OCRResult payload from raw item type %s", type(item).__name__)
            blocks.extend(_extract_ocr_result_blocks(item))
            continue

        bbox = None
        text = ""
        confidence = 0.0

        if isinstance(item, (list, tuple)) and len(item) >= 2:
            bbox = item[0]
            text_info = item[1]
            if isinstance(text_info, (list, tuple)) and len(text_info) >= 2:
                text = str(text_info[0] or "")
                try:
                    confidence = float(text_info[1] or 0.0)
                except Exception:
                    confidence = 0.0
            elif isinstance(text_info, dict):
                text = str(
                    text_info.get("text")
                    or text_info.get("word")
                    or text_info.get("value")
                    or text_info.get("rec_text")
                    or text_info.get("transcription")
                    or ""
                )
                for key in ("confidence", "score", "rec_score"):
                    value = text_info.get(key)
                    if value is not None:
                        try:
                            confidence = float(value)
                            break
                        except Exception:
                            continue
        elif isinstance(item, dict):
            nested = item.get("data") if isinstance(item.get("data"), dict) else item
            text = str(
                nested.get("text")
                or nested.get("word")
                or nested.get("value")
                or nested.get("rec_text")
                or nested.get("transcription")
                or ""
            )
            for key in ("confidence", "score", "rec_score"):
                value = nested.get(key)
                if value is not None:
                    try:
                        confidence = float(value)
                        break
                    except Exception:
                        continue
            bbox = nested.get("bbox") or nested.get("points") or nested.get("polygon") or nested.get("box")
        else:
            text = str(
                getattr(item, "text", None)
                or getattr(item, "word", None)
                or getattr(item, "value", None)
                or getattr(item, "rec_text", None)
                or getattr(item, "transcription", None)
                or ""
            )
            for key in ("confidence", "score", "rec_score"):
                value = getattr(item, key, None)
                if value is not None:
                    try:
                        confidence = float(value)
                        break
                    except Exception:
                        continue
            bbox = (
                getattr(item, "bbox", None)
                or getattr(item, "points", None)
                or getattr(item, "polygon", None)
                or getattr(item, "box", None)
            )

        if not bbox or not text:
            continue
        bounds = _extract_poly_bounds(bbox)
        if bounds is None:
            continue
        x0, y0, x1, y1 = bounds
        blocks.append(
            OCRBlock(
                text=str(text),
                confidence=confidence,
                x0=x0,
                y0=y0,
                x1=x1,
                y1=y1,
            )
        )

    LOGGER.info("Detected OCR blocks: %s", len(blocks))
    return blocks


def _clean_ocr_blocks(blocks: list[OCRBlock]) -> list[OCRBlock]:
    cleaned = [block for block in blocks if block.text.strip()]
    LOGGER.info("Blocks after cleaning: %s", len(cleaned))
    return cleaned


# def _classify_layout_blocks(blocks: list[OCRBlock], page_width: float, page_number: int) -> tuple[list[OCRBlock], list[OCRBlock]]:
#     midpoint = page_width / 2.0
#     if page_number % 2 == 0:
#         marginal_summaries = [block for block in blocks if block.center_x < midpoint]
#         main_content = [block for block in blocks if block.center_x >= midpoint]
#     else:
#         main_content = [block for block in blocks if block.center_x < midpoint]
#         marginal_summaries = [block for block in blocks if block.center_x >= midpoint]
#     LOGGER.info("Main content blocks: %s", len(main_content))
#     LOGGER.info("Marginal summary blocks: %s", len(marginal_summaries))
#     return main_content, marginal_summaries

def _classify_layout_blocks(
    blocks: list[OCRBlock],
    page_width: float,
    page_number: int,
) -> tuple[list[OCRBlock], list[OCRBlock]]:
    """
    Gazette layout classification.

    BSA measurements:

    Even pages:
        Summary centers ~80
        Main centers    >=220

    Odd pages:
        Main centers    <=321
        Summary centers >=504

    We intentionally leave a large dead zone between
    main and summary regions to avoid legal text
    being misclassified as summaries.
    """

    EVEN_SUMMARY_MAX_CENTER = 120.0
    ODD_SUMMARY_MIN_CENTER = 480.0

    main_content: list[OCRBlock] = []
    marginal_summaries: list[OCRBlock] = []

    if page_number % 2 == 0:
        # Even pages:
        # | SUMMARY | MAIN CONTENT |

        for block in blocks:
            if block.center_x <= EVEN_SUMMARY_MAX_CENTER:
                marginal_summaries.append(block)
            else:
                main_content.append(block)

    else:
        # Odd pages:
        # | MAIN CONTENT | SUMMARY |

        for block in blocks:
            if block.center_x >= ODD_SUMMARY_MIN_CENTER:
                marginal_summaries.append(block)
            else:
                main_content.append(block)

    LOGGER.info(
        "Layout classification page=%s main=%s summary=%s",
        page_number,
        len(main_content),
        len(marginal_summaries),
    )

    return main_content, marginal_summaries


def _sort_blocks(blocks: Iterable[OCRBlock]) -> list[OCRBlock]:
    return sorted(blocks, key=lambda block: (block.y0, block.x0))


def _reconstruct_lines(blocks: list[OCRBlock]) -> list[tuple[OCRBlock, ...]]:
    if not blocks:
        LOGGER.info("Reconstructed lines: 0")
        return []

    sorted_blocks = _sort_blocks(blocks)
    groups: list[list[OCRBlock]] = [[sorted_blocks[0]]]
    for block in sorted_blocks[1:]:
        previous = groups[-1][-1]
        y_tolerance = max(previous.height, block.height, 1.0) * 0.8
        if abs(block.y0 - previous.y0) <= y_tolerance:
            groups[-1].append(block)
        else:
            groups.append([block])

    lines = [tuple(sorted(group, key=lambda item: item.x0)) for group in groups if group]
    LOGGER.info("Reconstructed lines: %s", len(lines))
    return lines


def _reconstruct_text_from_line(blocks: tuple[OCRBlock, ...]) -> str:
    if not blocks:
        return ""
    pieces: list[str] = [blocks[0].text]
    previous_right = blocks[0].x1
    for block in blocks[1:]:
        gap = block.x0 - previous_right
        if gap > max(2.5, max(block.height, 1.0) * 0.25):
            pieces.append(" ")
        pieces.append(block.text)
        previous_right = block.x1
    return _clean_line("".join(pieces))


def _reconstruct_paragraphs(line_blocks: list[tuple[OCRBlock, ...]]) -> list[dict[str, Any]]:
    if not line_blocks:
        LOGGER.info("Reconstructed paragraphs: 0")
        return []

    paragraphs: list[dict[str, Any]] = []
    current_lines: list[tuple[OCRBlock, ...]] = [line_blocks[0]]
    previous_bottom = max(block.y1 for block in line_blocks[0])

    def _flush(lines: list[tuple[OCRBlock, ...]]) -> None:
        paragraph_texts = [_reconstruct_text_from_line(line) for line in lines]
        paragraph_texts = [text for text in paragraph_texts if text.strip()]
        if not paragraph_texts:
            return
        all_blocks = [block for line in lines for block in line]
        paragraphs.append(
            {
                "text": "\n".join(paragraph_texts),
                "y0": min(block.y0 for block in all_blocks),
                "y1": max(block.y1 for block in all_blocks),
                "lines": tuple(lines),
            }
        )

    for line in line_blocks[1:]:
        current_top = min(block.y0 for block in line)
        line_height = max(max(block.height for block in line), 12.0)
        if current_top - previous_bottom > line_height * 1.5:
            _flush(current_lines)
            current_lines = [line]
        else:
            current_lines.append(line)
        previous_bottom = max(block.y1 for block in line)

    _flush(current_lines)
    LOGGER.info("Reconstructed paragraphs: %s", len(paragraphs))
    return paragraphs


def _associate_summaries_with_paragraphs(
    paragraphs: list[dict[str, Any]],
    summaries: list[OCRBlock],
) -> list[dict[str, str]]:
    associations: list[dict[str, str]] = []
    for paragraph in paragraphs:
        p_y0 = float(paragraph["y0"])
        p_y1 = float(paragraph["y1"])
        summary_text = _clean_line(
            " ".join(
                summary.text
                for summary in summaries
                if not (summary.y1 < p_y0 or summary.y0 > p_y1)
            )
        )
        associations.append({"paragraph": paragraph["text"], "summary": summary_text})
    return associations


def _extract_page_with_ocr(ocr: Any, page: Any, page_number: int, width: float, height: float) -> PageExtraction:
    LOGGER.info("Running OCR for page %s", page_number)
    image = _page_to_image(page)
    LOGGER.info("OCR image for page %s has shape %s", page_number, getattr(image, "shape", None))
    started_at = time.perf_counter()

    if hasattr(ocr, "predict"):
        page_result = ocr.predict(
            image,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
    else:
        page_result = ocr.ocr(image, cls=False)

    LOGGER.info("OCR inference for page %s finished in %.2fs", page_number, time.perf_counter() - started_at)

    raw_blocks = _extract_raw_ocr_blocks(page_result)
    cleaned_blocks = _clean_ocr_blocks(raw_blocks)
    main_blocks, marginal_summaries = _classify_layout_blocks(cleaned_blocks, width, page_number)
    line_blocks = _reconstruct_lines(main_blocks)
    paragraph_payloads = _reconstruct_paragraphs(line_blocks)
    paragraph_associations = _associate_summaries_with_paragraphs(paragraph_payloads, marginal_summaries)

    lines = tuple(
        TextLine(
            text=paragraph["text"],
            page_number=page_number,
            line_index=index,
            spans=(TextSpan(text=paragraph["text"]),),
            bbox=None,
        )
        for index, paragraph in enumerate(paragraph_payloads)
        if paragraph["text"].strip()
    )

    raw_text = "\n".join(line.text for line in lines)
    _dump_page_trace(
        page_number=page_number,
        raw_blocks=raw_blocks,
        cleaned_blocks=cleaned_blocks,
        main_blocks=main_blocks,
        marginal_summaries=marginal_summaries,
        line_blocks=line_blocks,
        paragraph_payloads=paragraph_payloads,
        paragraph_associations=paragraph_associations,
        lines=lines,
    )
    page_metadata = {
        "width": width,
        "height": height,
        "ocr_backend": "paddleocr-3.x",
        "ocr_detections": len(raw_blocks),
        "cleaned_blocks": len(cleaned_blocks),
        "main_blocks": [
            {
                "text": block.text,
                "x0": block.x0,
                "y0": block.y0,
                "x1": block.x1,
                "y1": block.y1,
                "confidence": block.confidence,
            }
            for block in main_blocks
        ],
        "marginal_summaries": [
            {
                "text": block.text,
                "x0": block.x0,
                "y0": block.y0,
                "x1": block.x1,
                "y1": block.y1,
                "confidence": block.confidence,
            }
            for block in marginal_summaries
        ],
        "reconstructed_lines": len(line_blocks),
        "reconstructed_paragraphs": len(paragraph_payloads),
        "paragraph_associations": paragraph_associations,
    }

    LOGGER.info("Final output count: %s", len(lines))
    LOGGER.info("Completed OCR for page %s with %s lines", page_number, len(lines))
    return PageExtraction(page_number=page_number, lines=lines, raw_text=raw_text, page_metadata=page_metadata)


def extract_pdf_pages(pdf_path: str | Path) -> list[PageExtraction]:
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    ocr = _build_ocr_engine()
    fitz = _require_fitz()
    pages: list[PageExtraction] = []
    failures: list[tuple[int, Exception]] = []
    document = fitz.open(pdf_path)
    try:
        for page_number, page in enumerate(document, start=1):
            try:
                width = float(page.rect.width)
                height = float(page.rect.height)
                pages.append(_extract_page_with_ocr(ocr, page, page_number, width, height))
            except Exception as exc:  # pragma: no cover - runtime OCR failure
                LOGGER.exception("OCR failed for page %s", page_number)
                failures.append((page_number, exc))
                pages.append(
                    PageExtraction(
                        page_number=page_number,
                        lines=(),
                        raw_text="",
                        page_metadata={
                            "width": float(page.rect.width),
                            "height": float(page.rect.height),
                            "ocr_backend": "paddleocr-3.x",
                            "ocr_error": str(exc),
                        },
                    )
                )
    finally:
        document.close()

    if failures and not any(page.lines for page in pages):
        first_page, first_exc = failures[0]
        raise RuntimeError(f"OCR failed for all pages; first failure at page {first_page}: {first_exc}") from first_exc

    LOGGER.info("OCR finished for %s with %s pages and %s failures", pdf_path, len(pages), len(failures))
    return pages


__all__ = ["OCRBlock", "PageExtraction", "TextLine", "TextSpan", "extract_pdf_pages"]
