from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Iterable, Sequence

from .extract_text import PageExtraction, TextLine
from .schemas import DocumentMetadata


LEGAL_SECTION_RE = re.compile(
    r"^\s*(?:section\s+)?(?P<section>\d+[A-Za-z]?(?:\([^)]+\))?(?:[./-]\d+[A-Za-z]?)*)\s*(?:[.)-]?\s*(?P<title>.*))?$",
    re.I,
)
LEGAL_SERIAL_RE = re.compile(
    r"^\s*(?P<serial>\d+[A-Za-z]?(?:\([^)]+\))?(?:[./-]\d+[A-Za-z]?)*)\s*(?:[.)-]?\s*(?P<title>.*))?$",
    re.I,
)
LEGAL_SUBPART_RE = re.compile(r"^\s*\(?\s*(?P<label>[a-z])\s*\)?[.)]\s*(?P<content>.*)$", re.I)
CHAPTER_RE = re.compile(r"^\s*(?:chapter\s+)?(?P<label>[ivxlcdm\d]+)\b(?:[:.\-]?\s*(?P<title>.*))?$", re.I)
HEADING_RE = re.compile(r"^\s*(?P<num>\d+(?:\.\d+)*|[ivxlcdm]+(?:\.\d+)*)\s*(?:[.)-]?\s*(?P<title>.*))?$", re.I)
REFERENCE_NUMBER_RE = re.compile(r"\d+[A-Za-z]?(?:\([^)]+\))?(?:[./-]\d+[A-Za-z]?)*")
SECTION_REF_TRIGGER_RE = re.compile(r"\bsections?\b", re.I)
LEGAL_SECTION_REF_RE = re.compile(
    r"(?<!sub[-\s])\bsections?\b\s+(?P<body>\d+[A-Za-z]?(?:\s*(?:,|and|or)\s*\d+[A-Za-z]?)*\b)",
    re.I,
)
LEGAL_CHAPTER_RE = re.compile(r"^\s*CHAPTER\s*[A-Z0-9IVXLCDM]+\s*$", re.I)
LEGAL_SECTION_MARKER_RE = re.compile(r"^\s*(?P<serial>\d+)\.\s*(?P<rest>.*)$")
LEGAL_SUBSECTION_MARKER_RE = re.compile(r"^\s*\((?P<serial>\d+)\)\s*(?P<rest>.*)$")
LEGAL_CLAUSE_MARKER_RE = re.compile(r"^\s*\((?P<serial>[A-Za-z]+)\)\s*(?P<rest>.*)$")

LEGAL_NOISE_EXACT = {
    "THE GAZETTE OF INDIA EXTRAORDINARY",
    "MINISTRY OF LAW AND JUSTICE",
    "REGISTERED NO",
    "REGISTERED NO.",
    "PART II",
    "SEC. 1",
    "SEC 1",
}

LEGAL_NOISE_PATTERNS = [
    re.compile(r"^THE GAZETTE OF INDIA EXTRAORDINARY$"),
    re.compile(r"^\[Part .*"),
    re.compile(r"^Sec\.\s*\d+\]$"),
    re.compile(r"^_+$"),
    re.compile(r"^\d+\s+of\s+\d{4}\.$"),
]


def normalize_text(text: str) -> str:
    return " ".join(text.replace("\u00ad", "").replace("\xa0", " ").split()).strip()


def compact_lines(lines: Iterable[str]) -> str:
    return "\n".join(normalize_text(line) for line in lines if normalize_text(line))


def _is_noise_separator(normalized: str) -> bool:
    return bool(normalized) and (
        re.fullmatch(r"[_\-\s]{3,}", normalized) is not None
        or re.fullmatch(r"[.]{3,}", normalized) is not None
        or re.fullmatch(r"[-_]{2,}", normalized) is not None
    )


def is_noise_line(text: str) -> bool:
    normalized = normalize_text(text)
    return (
        not normalized
        or normalized.isdigit()
        or normalized.lower().startswith(("page ", "printed on"))
        or normalized in {"-", "—", "•"}
    )


def is_legal_noise_line(text: str) -> bool:
    normalized = normalize_text(text)
    if not normalized:
        return True
    upper = normalized.upper()
    if normalized.isdigit():
        return True
    if _is_noise_separator(normalized):
        return True
    if upper in LEGAL_NOISE_EXACT:
        return True
    if any(pattern.fullmatch(normalized) for pattern in LEGAL_NOISE_PATTERNS):
        return True
    if "THE GAZETTE OF INDIA" in upper or "MINISTRY OF LAW AND JUSTICE" in upper:
        return True
    if re.fullmatch(r"(?:PART\s+[IVXLCDM0-9]+|SEC\.?\s*\d+|PAGE\s+\d+)", upper):
        return True
    if upper.startswith("REGISTERED NO"):
        return True
    return False


def is_probable_title_fragment(text: str) -> bool:
    normalized = normalize_text(text)
    if not normalized or len(normalized) > 120:
        return False
    if normalized.endswith((".", ";", ":")):
        return False
    if normalized.isdigit():
        return False
    words = normalized.split()
    if len(words) > 10:
        return False
    return True


def build_record_id(*parts: str) -> str:
    digest = hashlib.sha1("||".join(normalize_text(part) for part in parts).encode("utf-8")).hexdigest()
    return digest[:24]


def make_metadata(
    source_path: str | Path,
    *,
    parser_name: str,
    parser_version: str = "1.0",
    source_pages: Sequence[int] | None = None,
    extra: dict | None = None,
) -> DocumentMetadata:
    path = Path(source_path)
    return DocumentMetadata(
        source_path=str(path),
        source_filename=path.name,
        parser_name=parser_name,
        parser_version=parser_version,
        source_pages=list(source_pages or []),
        extra=extra or {},
    )


def page_line_texts(page: PageExtraction) -> list[str]:
    return [line.text for line in page.lines if not is_noise_line(line.text)]


def extract_section_candidate(text: str) -> tuple[str | None, str | None]:
    normalized = normalize_text(text)
    match = LEGAL_SECTION_RE.match(normalized)
    if match:
        section = match.group("section")
        title = normalize_text(match.group("title") or "")
        return section, title or None
    return None, None


def extract_serial_candidate(line: TextLine) -> tuple[str | None, str | None]:
    normalized = normalize_text(line.text)
    if not normalized or not line.is_bold:
        return None, None
    match = LEGAL_SERIAL_RE.match(normalized)
    if not match:
        return None, None
    serial = match.group("serial")
    title = normalize_text(match.group("title") or "")
    return serial, title or None


def extract_subpart_candidate(text: str) -> tuple[str | None, str | None]:
    normalized = normalize_text(text)
    if not normalized:
        return None, None
    match = LEGAL_SUBPART_RE.match(normalized)
    if not match:
        return None, None
    label = match.group("label").lower()
    content = normalize_text(match.group("content") or "")
    return label, content or None


def extract_references(text: str, *, exclude: Iterable[str] | None = None) -> list[str]:
    normalized = normalize_text(text)
    if not normalized:
        return []
    excluded = {normalize_text(item) for item in (exclude or []) if normalize_text(item)}
    references: list[str] = []
    seen: set[str] = set()

    for match in LEGAL_SECTION_REF_RE.finditer(normalized):
        for number in re.findall(r"\d+[A-Za-z]?", match.group("body")):
            if number in excluded or number in seen:
                continue
            seen.add(number)
            references.append(number)
    return references


def extract_legal_chapter(text: str) -> str | None:
    normalized = normalize_text(text)
    if not normalized or not LEGAL_CHAPTER_RE.match(normalized):
        return None
    return " ".join(normalized.upper().split())


def extract_legal_section_serial(text: str) -> str | None:
    normalized = normalize_text(text)
    match = LEGAL_SECTION_MARKER_RE.match(normalized)
    if not match:
        return None
    return match.group("serial")


def extract_legal_subsection_id(text: str) -> str | None:
    normalized = normalize_text(text)
    match = LEGAL_SUBSECTION_MARKER_RE.match(normalized)
    if not match:
        return None
    return f"({match.group('serial')})"


def extract_legal_clause_id(text: str) -> str | None:
    normalized = normalize_text(text)
    match = LEGAL_CLAUSE_MARKER_RE.match(normalized)
    if not match:
        return None
    return f"({match.group('serial').lower()})"


def extract_chapter_tags(lines: Iterable[str]) -> list[str]:
    combined = " ".join(normalize_text(line) for line in lines if normalize_text(line))
    if not combined:
        return []
    tags: list[str] = []
    seen: set[str] = set()
    for part in combined.split(","):
        tag = normalize_text(part).rstrip(" .;:")
        if not tag or tag in seen:
            continue
        seen.add(tag)
        tags.append(tag)
    return tags


def extract_chapter_candidate(text: str) -> tuple[str | None, str | None]:
    normalized = normalize_text(text)
    if not normalized:
        return None, None
    if normalized.lower().startswith("chapter "):
        remainder = normalized[len("chapter ") :].strip()
        if " " in remainder:
            label, title = remainder.split(" ", 1)
        else:
            label, title = remainder, ""
        return label, normalize_text(title) or None
    match = CHAPTER_RE.match(normalized)
    if match and normalized.isupper():
        return match.group("label"), normalize_text(match.group("title") or "") or None
    return None, None


def extract_semantic_heading(text: str) -> tuple[int, str | None, str]:
    normalized = normalize_text(text)
    chapter_label, chapter_title = extract_chapter_candidate(normalized)
    if chapter_label:
        return 0, chapter_title, chapter_label
    section_match = HEADING_RE.match(normalized)
    if section_match:
        num = section_match.group("num")
        title = normalize_text(section_match.group("title") or "") or None
        if num.count(".") == 0:
            return 1, title, num
        if num.count(".") == 1:
            return 2, title, num
        return 3, title, num
    return -1, None, ""
