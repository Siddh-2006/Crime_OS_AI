from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Iterator

from .extract_text import PageExtraction
from .schemas import ClauseRecord, LegalSectionRecord, SubsectionRecord
from .utils import (
    build_record_id,
    compact_lines,
    extract_chapter_tags,
    extract_legal_clause_id,
    extract_legal_chapter,
    extract_legal_section_serial,
    extract_legal_subsection_id,
    extract_references,
    is_legal_noise_line,
    make_metadata,
    normalize_text,
)


@dataclass(frozen=True)
class OCRBlockView:
    text: str
    page_number: int
    x0: float
    y0: float
    x1: float
    y1: float
    kind: str = "content"
    sequence: int = 0

    @property
    def sort_key(self) -> tuple[int, float, float, int, int]:
        kind_order = 0 if self.kind == "summary" else 1
        return self.page_number, self.y0, self.x0, kind_order, self.sequence


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except Exception:
        return default


def _append_page_numbers(node: dict[str, object], page_number: int) -> None:
    if page_number <= 0:
        return
    pages = node.setdefault("page_numbers", [])
    if page_number not in pages:
        pages.append(page_number)


def _coerce_block(
    *,
    text: str,
    page_number: int,
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    kind: str,
    sequence: int,
) -> OCRBlockView | None:
    normalized = normalize_text(text)
    if not normalized:
        return None
    return OCRBlockView(
        text=normalized,
        page_number=page_number,
        x0=x0,
        y0=y0,
        x1=x1,
        y1=y1,
        kind=kind,
        sequence=sequence,
    )


def _is_legal_content_block(text: str) -> bool:
    return not is_legal_noise_line(text)


def _extract_page_blocks(page: PageExtraction) -> list[OCRBlockView]:
    metadata = page.page_metadata if isinstance(page.page_metadata, dict) else {}
    blocks: list[OCRBlockView] = []

    main_blocks = metadata.get("main_blocks")
    summary_blocks = metadata.get("marginal_summaries")

    if isinstance(main_blocks, list) and main_blocks:
        for sequence, block in enumerate(main_blocks):
            if not isinstance(block, dict):
                continue
            text = str(block.get("text", ""))
            if not _is_legal_content_block(text):
                continue
            block_view = _coerce_block(
                text=text,
                page_number=page.page_number,
                x0=_as_float(block.get("x0")),
                y0=_as_float(block.get("y0")),
                x1=_as_float(block.get("x1")),
                y1=_as_float(block.get("y1")),
                kind="content",
                sequence=sequence,
            )
            if block_view is not None:
                blocks.append(block_view)

        if isinstance(summary_blocks, list):
            for sequence, block in enumerate(summary_blocks):
                if not isinstance(block, dict):
                    continue
                text = str(block.get("text", ""))
                if not _is_legal_content_block(text):
                    continue
                block_view = _coerce_block(
                    text=text,
                    page_number=page.page_number,
                    x0=_as_float(block.get("x0")),
                    y0=_as_float(block.get("y0")),
                    x1=_as_float(block.get("x1")),
                    y1=_as_float(block.get("y1")),
                    kind="summary",
                    sequence=sequence,
                )
                if block_view is not None:
                    blocks.append(block_view)
        return sorted(blocks, key=lambda block: block.sort_key)

    # Fallback path for tests and non-OCR inputs. Treat page lines as ordered
    # OCR blocks with synthetic coordinates.
    for sequence, line in enumerate(page.lines):
        text = str(getattr(line, "text", ""))
        if not _is_legal_content_block(text):
            continue
        bbox = getattr(line, "bbox", None)
        if bbox and len(bbox) >= 4:
            x0 = _as_float(bbox[0])
            y0 = _as_float(bbox[1])
            x1 = _as_float(bbox[2])
            y1 = _as_float(bbox[3])
        else:
            x0 = 0.0
            y0 = float(getattr(line, "line_index", sequence))
            x1 = max(float(len(getattr(line, "text", ""))), 1.0)
            y1 = y0 + 1.0

        block_view = _coerce_block(
            text=text,
            page_number=page.page_number,
            x0=x0,
            y0=y0,
            x1=x1,
            y1=y1,
            kind="content",
            sequence=sequence,
        )
        if block_view is not None:
            blocks.append(block_view)

    return sorted(blocks, key=lambda block: block.sort_key)


def _append_line(node: dict[str, object], text: str, page_number: int) -> None:
    node.setdefault("content_lines", []).append(text)
    _append_page_numbers(node, page_number)


def _append_summary(node: dict[str, object], text: str, page_number: int) -> None:
    node.setdefault("summary_lines", []).append(text)
    _append_page_numbers(node, page_number)


def _flush_clause(node: dict[str, object] | None, section_serial: str, parent_clauses: list[ClauseRecord]) -> None:
    if not node:
        return

    content = compact_lines(str(line) for line in node.get("content_lines", []) if normalize_text(str(line)))
    if not content:
        return

    clause = ClauseRecord(
        id=str(node.get("id") or ""),
        content=content,
        references=extract_references(content, exclude=[section_serial]),
        page=int(node.get("page") or 0),
        source_page=int(node.get("source_page") or 0),
        source_pages=list(dict.fromkeys(node.get("source_pages", []))),
    )
    parent_clauses.append(clause)


def _flush_subsection(
    node: dict[str, object] | None,
    section_serial: str,
    parent_subsections: list[SubsectionRecord],
) -> None:
    if not node:
        return

    current_clause = node.get("current_clause")
    if isinstance(current_clause, dict):
        _flush_clause(current_clause, section_serial, node.setdefault("clauses", []))
        node["current_clause"] = None

    content = compact_lines(str(line) for line in node.get("content_lines", []) if normalize_text(str(line)))
    if not content:
        return

    subsection = SubsectionRecord(
        id=str(node.get("id") or ""),
        content=content,
        references=extract_references(content, exclude=[section_serial]),
        page=int(node.get("page") or 0),
        source_page=int(node.get("source_page") or 0),
        source_pages=list(dict.fromkeys(node.get("source_pages", []))),
        clauses=list(node.get("clauses", [])),
    )
    parent_subsections.append(subsection)


def _flush_section_node(
    node: dict[str, object] | None,
    *,
    act: str,
) -> LegalSectionRecord | None:
    if not node:
        return None

    current_subsection = node.get("current_subsection")
    if isinstance(current_subsection, dict):
        _flush_subsection(current_subsection, str(node.get("serial_number") or ""), node.setdefault("subsections", []))
        node["current_subsection"] = None

    current_clause = node.get("current_clause")
    if isinstance(current_clause, dict):
        _flush_clause(current_clause, str(node.get("serial_number") or ""), node.setdefault("clauses", []))
        node["current_clause"] = None

    content = compact_lines(str(line) for line in node.get("content_lines", []) if normalize_text(str(line)))
    if not content:
        return None

    serial_number = str(node.get("serial_number") or "")
    chapter = str(node.get("chapter") or "")
    chapter_tag = list(node.get("chapter_tag", []))
    summary = compact_lines(str(line) for line in node.get("summary_lines", []) if normalize_text(str(line)))
    page_numbers = list(dict.fromkeys(node.get("page_numbers", [])))

    return LegalSectionRecord(
        id=build_record_id(act, serial_number, chapter, content[:200]),
        act=act,
        serial_number=serial_number,
        chapter=chapter,
        chapter_tag=chapter_tag,
        content=content,
        summary=summary,
        references=extract_references(content, exclude=[serial_number]),
        page_numbers=page_numbers,
        metadata=node["metadata"],
    )


def _start_section(
    *,
    serial_number: str,
    chapter: str,
    chapter_tags: list[str],
    page_number: int,
    metadata: Any,
) -> dict[str, object]:
    return {
        "serial_number": serial_number,
        "chapter": chapter,
        "chapter_tag": list(chapter_tags),
        "content_lines": [],
        "summary_lines": [],
        "page_numbers": [page_number],
        "metadata": metadata,
    }


def _write_jsonl_record(handle: Any, record: LegalSectionRecord) -> None:
    handle.write(record.model_dump_json() + "\n")
    handle.flush()


def _convert_jsonl_to_json(jsonl_path: Path, json_path: Path) -> None:
    json_path.parent.mkdir(parents=True, exist_ok=True)
    with jsonl_path.open("r", encoding="utf-8") as source, json_path.open("w", encoding="utf-8") as target:
        target.write("[")
        first = True
        for line in source:
            line = line.strip()
            if not line:
                continue
            payload = json.loads(line)
            if not first:
                target.write(",\n")
            target.write(json.dumps(payload, ensure_ascii=False, indent=2))
            first = False
        target.write("]")


def parse_legal_act_pages(
    pdf_path: str | Path,
    pages: Iterable[PageExtraction],
    *,
    act: str,
    parser_name: str,
    output_dir: str | Path | None = None,
) -> list[LegalSectionRecord] | Path:
    metadata = make_metadata(pdf_path, parser_name=parser_name)
    current_section: dict[str, object] | None = None
    current_chapter = ""
    current_chapter_tags: list[str] = []
    pending_chapter = ""
    pending_chapter_tags: list[str] = []
    collecting_chapter_tags = False
    pending_summary_lines: list[tuple[str, int]] = []

    records: list[LegalSectionRecord] | None = None
    jsonl_handle = None
    jsonl_path: Path | None = None
    json_path: Path | None = None
    if output_dir is not None:
        output_base = Path(output_dir)
        output_base.mkdir(parents=True, exist_ok=True)
        stem = Path(pdf_path).stem
        jsonl_path = output_base / f"{stem}.jsonl"
        json_path = output_base / f"{stem}.json"
        jsonl_handle = jsonl_path.open("w", encoding="utf-8")
    else:
        records = []

    section_count = 0
    try:
        for page in pages:
            page_blocks = _extract_page_blocks(page)
            for block in page_blocks:
                text = block.text

                if block.kind == "summary":
                    pending_summary_lines.append((text, block.page_number))
                    continue

                chapter = extract_legal_chapter(text)
                if chapter:
                    pending_chapter = chapter
                    pending_chapter_tags = []
                    collecting_chapter_tags = True
                    continue

                serial_number = extract_legal_section_serial(text)
                if serial_number:
                    if current_section is not None:
                        for summary_line, summary_page in pending_summary_lines:
                            _append_summary(current_section, summary_line, summary_page)
                        pending_summary_lines.clear()
                        finalized = _flush_section_node(current_section, act=act)
                        if finalized is not None:
                            section_count += 1
                            if records is not None:
                                records.append(finalized)
                            elif jsonl_handle is not None:
                                _write_jsonl_record(jsonl_handle, finalized)
                        current_section = None

                    if pending_chapter:
                        current_chapter = pending_chapter
                        current_chapter_tags = extract_chapter_tags(pending_chapter_tags)
                        pending_chapter = ""
                        pending_chapter_tags = []
                    collecting_chapter_tags = False

                    current_section = _start_section(
                        serial_number=serial_number,
                        chapter=current_chapter,
                        chapter_tags=current_chapter_tags,
                        page_number=block.page_number,
                        metadata=metadata,
                    )
                    if pending_summary_lines:
                        for summary_line, summary_page in pending_summary_lines:
                            _append_summary(current_section, summary_line, summary_page)
                        pending_summary_lines.clear()
                    _append_line(current_section, text, block.page_number)
                    continue

                if collecting_chapter_tags and pending_chapter:
                    pending_chapter_tags.append(text)
                    continue

                if current_section is None:
                    continue

                _append_line(current_section, text, block.page_number)
                current_subsection = current_section.get("current_subsection")
                current_clause = current_section.get("current_clause")

                subsection_id = extract_legal_subsection_id(text)
                clause_id = extract_legal_clause_id(text)

                if subsection_id:
                    if isinstance(current_subsection, dict):
                        _flush_subsection(
                            current_subsection,
                            str(current_section.get("serial_number") or ""),
                            current_section.setdefault("subsections", []),
                        )
                    if isinstance(current_clause, dict):
                        _flush_clause(
                            current_clause,
                            str(current_section.get("serial_number") or ""),
                            current_section.setdefault("clauses", []),
                        )

                    current_section["current_subsection"] = {
                        "id": subsection_id,
                        "content_lines": [text],
                        "clauses": [],
                        "current_clause": None,
                        "page_numbers": [block.page_number],
                    }
                    current_section["current_clause"] = None
                elif clause_id:
                    if isinstance(current_subsection, dict):
                        _append_line(current_subsection, text, block.page_number)
                        subsection_clause = current_subsection.get("current_clause")
                        if isinstance(subsection_clause, dict):
                            _flush_clause(
                                subsection_clause,
                                str(current_section.get("serial_number") or ""),
                                current_subsection.setdefault("clauses", []),
                            )
                        current_subsection["current_clause"] = {
                            "id": clause_id,
                            "parent_id": str(current_subsection.get("id") or ""),
                            "content_lines": [text],
                            "page_numbers": [block.page_number],
                        }
                    else:
                        if isinstance(current_clause, dict):
                            _flush_clause(
                                current_clause,
                                str(current_section.get("serial_number") or ""),
                                current_section.setdefault("clauses", []),
                            )
                        current_section["current_clause"] = {
                            "id": clause_id,
                            "parent_id": str(current_section.get("serial_number") or ""),
                            "content_lines": [text],
                            "page_numbers": [block.page_number],
                        }
                else:
                    if isinstance(current_subsection, dict):
                        _append_line(current_subsection, text, block.page_number)
                        subsection_clause = current_subsection.get("current_clause")
                        if isinstance(subsection_clause, dict):
                            _append_line(subsection_clause, text, block.page_number)
                    elif isinstance(current_clause, dict):
                        _append_line(current_clause, text, block.page_number)

                if pending_chapter and not collecting_chapter_tags:
                    pending_chapter = ""
                    pending_chapter_tags = []

        if current_section is not None:
            for summary_line, summary_page in pending_summary_lines:
                _append_summary(current_section, summary_line, summary_page)
            pending_summary_lines.clear()
            finalized = _flush_section_node(current_section, act=act)
            if finalized is not None:
                section_count += 1
                if records is not None:
                    records.append(finalized)
                elif jsonl_handle is not None:
                    _write_jsonl_record(jsonl_handle, finalized)
    finally:
        if jsonl_handle is not None:
            jsonl_handle.close()

    if jsonl_path is not None and json_path is not None:
        _convert_jsonl_to_json(jsonl_path, json_path)
        return json_path

    return records or []


def parse_bns_pdf(
    pdf_path: str | Path,
    pages: Iterable[PageExtraction],
    *,
    output_dir: str | Path | None = None,
) -> list[LegalSectionRecord] | Path:
    return parse_legal_act_pages(pdf_path, pages, act="BNS", parser_name="parse_bns", output_dir=output_dir)
