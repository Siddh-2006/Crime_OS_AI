from __future__ import annotations

from pathlib import Path
from typing import Iterable

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


def _build_summary_lookup(page: PageExtraction) -> dict[str, list[str]]:
    metadata = page.page_metadata if isinstance(page.page_metadata, dict) else {}
    associations = metadata.get("paragraph_associations", [])
    lookup: dict[str, list[str]] = {}
    if not isinstance(associations, list):
        return lookup

    for association in associations:
        if not isinstance(association, dict):
            continue
        paragraph = normalize_text(str(association.get("paragraph", "")))
        summary = normalize_text(str(association.get("summary", "")))
        if not paragraph or not summary:
            continue
        lookup.setdefault(paragraph, []).append(summary)
    return lookup


def _consume_summary(summary_lookup: dict[str, list[str]], text: str) -> str:
    key = normalize_text(text)
    if not key:
        return ""
    summaries = summary_lookup.get(key)
    if not summaries:
        return ""
    summary = summaries.pop(0)
    if not summaries:
        summary_lookup.pop(key, None)
    return summary


def _append_line(node: dict[str, object], text: str, page_number: int) -> None:
    node.setdefault("content_lines", []).append(text)
    pages = node.setdefault("source_pages", [])
    if page_number not in pages:
        pages.append(page_number)
    if not node.get("page"):
        node["page"] = page_number
    if not node.get("source_page"):
        node["source_page"] = page_number


def _append_summary(node: dict[str, object], summary_text: str) -> None:
    if not summary_text:
        return
    node.setdefault("summary_lines", []).append(summary_text)


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


def _flush_section(records: list[LegalSectionRecord], node: dict[str, object] | None, *, act: str) -> None:
    if not node:
        return

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
        return

    serial_number = str(node.get("serial_number") or "")
    chapter = str(node.get("chapter") or "")
    summary = compact_lines(str(line) for line in node.get("summary_lines", []) if normalize_text(str(line)))
    section = LegalSectionRecord(
        id=build_record_id(act, serial_number, chapter, content[:200]),
        act=act,
        serial_number=serial_number,
        chapter=chapter,
        chapter_tag=list(node.get("chapter_tag", [])),
        content=content,
        summary=summary,
        references=extract_references(content, exclude=[serial_number]),
        clauses=list(node.get("clauses", [])),
        subsections=list(node.get("subsections", [])),
        page=int(node.get("page") or 0),
        source_page=int(node.get("source_page") or 0),
        source_pages=list(dict.fromkeys(node.get("source_pages", []))),
        metadata=node["metadata"],

    )
    records.append(section)


def parse_legal_act_pages(
    pdf_path: str | Path,
    pages: Iterable[PageExtraction],
    *,
    act: str,
    parser_name: str,
) -> list[LegalSectionRecord]:
    metadata = make_metadata(pdf_path, parser_name=parser_name)
    records: list[LegalSectionRecord] = []

    current_section: dict[str, object] | None = None
    current_chapter = ""
    current_chapter_tags: list[str] = []
    chapter_tag_buffer: list[str] = []

    for page in pages:
        summary_lookup = _build_summary_lookup(page)
        lines = [line for line in page.lines if not is_legal_noise_line(line.text)]
        index = 0
        while index < len(lines):
            line = lines[index]
            text = normalize_text(line.text)
            summary_text = _consume_summary(summary_lookup, text)

            chapter = extract_legal_chapter(text)
            if chapter:
                # 1. Only flush the PREVIOUS section if we are actively building one.
                # If current_section is already None, it means we are just seeing 
                # another consecutive chapter line, so we don't flush again.
                if current_section is not None:
                    _flush_section(records, current_section, act=act)
                    current_section = None  # Clear it so subsequent duplicate chapters don't re-trigger a flush
                
                # 2. Continually overwrite with the latest chapter found
                current_chapter = chapter
                
                # 3. Reset the tag buffers so they only collect lines following this specific instance
                current_chapter_tags = []
                chapter_tag_buffer = []
                
                index += 1
                continue

            serial_number = extract_legal_section_serial(text)
            if serial_number and serial_number != str(current_section.get("serial_number") if current_section else ""):
                if not current_chapter_tags and chapter_tag_buffer:
                    current_chapter_tags = extract_chapter_tags(chapter_tag_buffer)
                chapter_tag_buffer = []

                if current_section is not None:
                    _flush_section(records, current_section, act=act)

                current_section = {
                    "serial_number": serial_number,
                    "chapter": current_chapter,
                    "chapter_tag": list(current_chapter_tags),
                    "content_lines": [line.text],
                    "clauses": [],
                    "subsections": [],
                    "current_subsection": None,
                    "current_clause": None,
                    "summary_lines": [summary_text] if summary_text else [],
                    "page": page.page_number,
                    "source_page": page.page_number,
                    "source_pages": [page.page_number],
                    "metadata": metadata,
                }
                index += 1
                continue

            if current_section is None:
                if current_chapter:
                    chapter_tag_buffer.append(line.text)
                index += 1
                continue

            _append_summary(current_section, summary_text)

            subsection_id = extract_legal_subsection_id(text)
            clause_id = extract_legal_clause_id(text)

            _append_line(current_section, line.text, page.page_number)

            current_subsection = current_section.get("current_subsection")
            current_clause = current_section.get("current_clause")

            if subsection_id:
                if isinstance(current_subsection, dict):
                    _flush_subsection(
                        current_subsection,
                        str(current_section.get("serial_number") or ""),
                        current_section.setdefault("subsections", []),
                    )
                if isinstance(current_clause, dict):
                    _flush_clause(current_clause, str(current_section.get("serial_number") or ""), current_section.setdefault("clauses", []))

                current_section["current_subsection"] = {
                    "id": subsection_id,
                    "content_lines": [line.text],
                    "clauses": [],
                    "current_clause": None,
                    "page": page.page_number,
                    "source_page": page.page_number,
                    "source_pages": [page.page_number],
                }
                current_section["current_clause"] = None
            elif clause_id:
                if isinstance(current_subsection, dict):
                    _append_line(current_subsection, line.text, page.page_number)
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
                        "content_lines": [line.text],
                        "page": page.page_number,
                        "source_page": page.page_number,
                        "source_pages": [page.page_number],
                    }
                else:
                    if isinstance(current_clause, dict):
                        _flush_clause(current_clause, str(current_section.get("serial_number") or ""), current_section.setdefault("clauses", []))
                    current_section["current_clause"] = {
                        "id": clause_id,
                        "parent_id": str(current_section.get("serial_number") or ""),
                        "content_lines": [line.text],
                        "page": page.page_number,
                        "source_page": page.page_number,
                        "source_pages": [page.page_number],
                    }
            else:
                if isinstance(current_subsection, dict):
                    _append_line(current_subsection, line.text, page.page_number)
                    subsection_clause = current_subsection.get("current_clause")
                    if isinstance(subsection_clause, dict):
                        _append_line(subsection_clause, line.text, page.page_number)
                elif isinstance(current_clause, dict):
                    _append_line(current_clause, line.text, page.page_number)

            index += 1

    if current_section is not None:
        _flush_section(records, current_section, act=act)

    return records


def parse_bns_pdf(pdf_path: str | Path, pages: Iterable[PageExtraction]) -> list[LegalSectionRecord]:
    return parse_legal_act_pages(pdf_path, pages, act="BNS", parser_name="parse_bns")
