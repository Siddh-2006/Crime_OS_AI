from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable


try:  # pragma: no cover - depends on environment
    import fitz  # type: ignore
except Exception:  # pragma: no cover - we keep a helpful runtime failure
    fitz = None


@dataclass(frozen=True)
class TextSpan:
    text: str
    font: str = ""
    size: float = 0.0
    flags: int = 0
    color: int | None = None

    @property
    def is_bold(self) -> bool:
        return bool(self.flags & 16) or "bold" in self.font.lower()


@dataclass(frozen=True)
class TextLine:
    text: str
    page_number: int
    line_index: int
    spans: tuple[TextSpan, ...] = ()
    bbox: tuple[float, float, float, float] | None = None

    @property
    def is_bold(self) -> bool:
        return any(span.is_bold for span in self.spans)

    @property
    def max_font_size(self) -> float:
        return max((span.size for span in self.spans), default=0.0)


@dataclass(frozen=True)
class PageExtraction:
    page_number: int
    lines: tuple[TextLine, ...]
    raw_text: str
    page_metadata: dict[str, Any] = field(default_factory=dict)


def _require_fitz() -> Any:
    if fitz is None:  # pragma: no cover - validated at runtime when dependency is missing
        raise RuntimeError(
            "PyMuPDF (fitz) is not installed. Install project dependencies before running extraction."
        )
    return fitz


def _clean_line(text: str) -> str:
    return " ".join(text.replace("\u00ad", "").split()).strip()
    # return text


def _page_lines_from_dict(page_dict: dict[str, Any], page_number: int) -> tuple[TextLine, ...]:
    lines: list[TextLine] = []
    for block in page_dict.get("blocks", []):
        if block.get("type", 0) != 0:
            continue
        for line_index, line in enumerate(block.get("lines", [])):
            spans = tuple(
                TextSpan(
                    text=span.get("text", ""),
                    font=span.get("font", ""),
                    size=float(span.get("size", 0.0) or 0.0),
                    flags=int(span.get("flags", 0) or 0),
                    color=span.get("color"),
                )
                for span in line.get("spans", [])
                if span.get("text", "").strip()
            )
            text = _clean_line("".join(span.text for span in spans))
            if not text:
                continue
            lines.append(
                TextLine(
                    text=text,
                    page_number=page_number,
                    line_index=line_index,
                    spans=spans,
                    bbox=tuple(line.get("bbox", [])) or None,
                )
            )
    return tuple(lines)


def extract_pdf_pages(pdf_path: str | Path) -> list[PageExtraction]:
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    fitz_module = _require_fitz()
    pages: list[PageExtraction] = []
    document = fitz_module.open(pdf_path)
    try:
        for page_number, page in enumerate(document, start=1):
            try:
                page_dict = page.get_text("dict")
                lines = _page_lines_from_dict(page_dict, page_number)
                raw_text = _clean_line(page.get_text("text") or "")
            except Exception:
                raw_text = _clean_line(page.get_text("text") or "")
                fallback_lines = tuple(
                    TextLine(text=line, page_number=page_number, line_index=index)
                    for index, line in enumerate(raw_text.splitlines())
                    if line.strip()
                )
                lines = fallback_lines
            pages.append(
                PageExtraction(
                    page_number=page_number,
                    lines=lines,
                    raw_text=raw_text,
                    page_metadata={"width": page.rect.width, "height": page.rect.height},
                )
            )
    finally:
        document.close()
    return pages

