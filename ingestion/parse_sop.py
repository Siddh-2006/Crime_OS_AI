from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from .extract_text import PageExtraction
from .schemas import SOPRecord
from .utils import (
    build_record_id,
    compact_lines,
    extract_semantic_heading,
    is_noise_line,
    is_probable_title_fragment,
    make_metadata,
    normalize_text,
)


@dataclass
class SOPState:
    chapter: str | None = None
    section: str | None = None
    subsection: str | None = None
    heading_stack: list[str] = None

    def __post_init__(self) -> None:
        if self.heading_stack is None:
            self.heading_stack = []


def _flush_chunk(records: list[SOPRecord], chunk: dict[str, object] | None) -> None:
    if not chunk:
        return
    content = compact_lines(str(line) for line in chunk.get("content_lines", []) if normalize_text(str(line)))
    if not content:
        return
    record = SOPRecord(
        id=build_record_id(chunk.get("document", "NCRP_SOP"), chunk.get("chapter") or "", chunk.get("section") or "", content[:200]),
        act=str(chunk.get("act", "NCRP")),
        document=str(chunk.get("document", "NCRP_SOP")),
        chapter=chunk.get("chapter") or None,
        section=chunk.get("section") or None,
        subsection=chunk.get("subsection") or None,
        content=content,
        source_page=int(chunk.get("source_page") or 0),
        source_pages=list(dict.fromkeys(chunk.get("source_pages", []))),
        hierarchy=[value for value in [chunk.get("chapter"), chunk.get("section"), chunk.get("subsection")] if value],
        metadata=chunk["metadata"],
    )
    records.append(record)


def parse_sop_pages(
    pdf_path: str | Path,
    pages: Iterable[PageExtraction],
    *,
    document_name: str = "NCRP_SOP",
) -> list[SOPRecord]:
    metadata = make_metadata(pdf_path, parser_name="parse_sop")
    records: list[SOPRecord] = []
    chunk: dict[str, object] | None = None
    state = SOPState()
    chapter_intro_lines: list[str] = []
    act_name = document_name.split("_", 1)[0].upper() if document_name else "NCRP"

    for page in pages:
        lines = [line.text for line in page.lines if not is_noise_line(line.text)]
        index = 0
        while index < len(lines):
            line = lines[index]
            level, title, label = extract_semantic_heading(line)
            if level >= 0:
                if level == 0:
                    _flush_chunk(records, chunk)
                    state.chapter = title or label
                    state.section = None
                    state.subsection = None
                    chapter_intro_lines = []
                    chunk = None
                elif level == 1:
                    _flush_chunk(records, chunk)
                    state.section = title or label
                    state.subsection = None
                    chunk = {
                        "act": act_name,
                        "document": document_name,
                        "chapter": state.chapter,
                        "section": state.section,
                        "subsection": state.subsection,
                        "content_lines": [*chapter_intro_lines, line],
                        "source_page": page.page_number,
                        "source_pages": [page.page_number],
                        "metadata": metadata,
                    }
                    chapter_intro_lines = []
                elif level >= 2:
                    _flush_chunk(records, chunk)
                    state.subsection = title or label
                    chunk = {
                        "act": act_name,
                        "document": document_name,
                        "chapter": state.chapter,
                        "section": state.section,
                        "subsection": state.subsection,
                        "content_lines": [line],
                        "source_page": page.page_number,
                        "source_pages": [page.page_number],
                        "metadata": metadata,
                    }

                if not title and index + 1 < len(lines):
                    next_line = lines[index + 1]
                    if is_probable_title_fragment(next_line):
                        if level == 0:
                            state.chapter = next_line
                        elif level == 1:
                            state.section = next_line
                        else:
                            state.subsection = next_line
                        index += 1
                index += 1
                continue

            if state.section is None:
                chapter_intro_lines.append(line)
                index += 1
                continue
            if chunk is None:
                index += 1
                continue
            chunk["content_lines"].append(line)
            pages_list = chunk.setdefault("source_pages", [])
            if page.page_number not in pages_list:
                pages_list.append(page.page_number)
            index += 1

    _flush_chunk(records, chunk)
    return records


def parse_sop_pdf(pdf_path: str | Path, pages: Iterable[PageExtraction]) -> list[SOPRecord]:
    return parse_sop_pages(pdf_path, pages, document_name="NCRP_SOP")
