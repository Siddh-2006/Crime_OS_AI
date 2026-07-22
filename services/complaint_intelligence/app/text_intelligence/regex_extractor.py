"""
IndianRegexExtractor — deterministic regex-based entity extraction.

Targets investigation-relevant Indian patterns:
  Phone, Email, Aadhaar, PAN, UPI, IFSC, Bank Account,
  Vehicle Number, Amount, Date, Time, Transaction ID / RRN.

Pure Python — no AI models, fully deterministic, 100 % testable.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from app.schemas.text_intelligence import ExtractedEntity
from app.text_intelligence.interfaces import IRegexExtractor


@dataclass(frozen=True)
class _Pattern:
    """Internal pattern descriptor."""
    entity_type: str
    regex: re.Pattern[str]


# ── Compiled patterns ─────────────────────────────────────────────────────────
_PATTERNS: list[_Pattern] = [
    # Indian phone: +91-XXXXXXXXXX, 91XXXXXXXXXX, 0XXXXXXXXXX, XXXXXXXXXX (10 digits)
    _Pattern(
        entity_type="phone",
        regex=re.compile(
            r"(?<!\d)"                         # no digit before
            r"(?:\+91[\s\-]?)?"                # optional +91 prefix
            r"(?:91)?"                         # optional 91 prefix (no +)
            r"(?:0)?"                          # optional leading 0
            r"([6-9]\d{9})"                    # Indian mobile: starts 6-9, 10 digits
            r"(?!\d)",                         # no digit after
        ),
    ),
    # Email
    _Pattern(
        entity_type="email",
        regex=re.compile(
            r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
        ),
    ),
    # Aadhaar: 4-digit groups separated by space or dash (12 digits total)
    _Pattern(
        entity_type="aadhaar",
        regex=re.compile(
            r"(?<!\d)"
            r"[2-9]\d{3}[\s\-]\d{4}[\s\-]\d{4}"
            r"(?!\d)",
        ),
    ),
    # PAN: 5 alpha + 4 digit + 1 alpha (e.g. ABCDE1234F)
    _Pattern(
        entity_type="pan",
        regex=re.compile(
            r"\b[A-Z]{5}\d{4}[A-Z]\b",
        ),
    ),
    # UPI: user@bank (e.g. user@ybl, name@paytm)
    _Pattern(
        entity_type="upi_id",
        regex=re.compile(
            r"\b[a-zA-Z0-9._\-]+@[a-zA-Z]{2,}\b",
        ),
    ),
    # IFSC: 4 alpha + 0 + 6 alphanumeric (e.g. SBIN0001234)
    _Pattern(
        entity_type="ifsc",
        regex=re.compile(
            r"\b[A-Z]{4}0[A-Z0-9]{6}\b",
        ),
    ),
    # Vehicle Number: XX00XX0000 or XX 00 XX 0000
    _Pattern(
        entity_type="vehicle_number",
        regex=re.compile(
            r"\b[A-Z]{2}[\s\-]?\d{1,2}[\s\-]?[A-Z]{1,3}[\s\-]?\d{4}\b",
        ),
    ),
    # Amount: Rs., ₹, INR followed by number (with optional commas / decimals)
    _Pattern(
        entity_type="amount",
        regex=re.compile(
            r"(?:Rs\.?|₹|INR)\s*[\d,]+(?:\.\d{1,2})?",
            re.IGNORECASE,
        ),
    ),
    # Date: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
    _Pattern(
        entity_type="date",
        regex=re.compile(
            r"\b\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}\b",
        ),
    ),
    # Date (natural): 12 July 2026, July 12 2026, 12 Jul 2026
    _Pattern(
        entity_type="date",
        regex=re.compile(
            r"\b\d{1,2}\s+"
            r"(?:January|February|March|April|May|June|July|August|September|October|November|December"
            r"|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
            r"\s+\d{4}\b",
            re.IGNORECASE,
        ),
    ),
    _Pattern(
        entity_type="date",
        regex=re.compile(
            r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December"
            r"|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
            r"\s+\d{1,2},?\s+\d{4}\b",
            re.IGNORECASE,
        ),
    ),
    # Time: HH:MM AM/PM, HH:MM:SS
    _Pattern(
        entity_type="time",
        regex=re.compile(
            r"\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\b",
        ),
    ),
    # Transaction Ref / RRN: 'RRN' followed by 10-16 digits
    _Pattern(
        entity_type="transaction_ref",
        regex=re.compile(
            r"\bRRN[\s:]*\d{10,16}\b",
            re.IGNORECASE,
        ),
    ),
    # Bank account number: standalone 9-18 digit number
    _Pattern(
        entity_type="bank_account",
        regex=re.compile(
            r"(?<!\d)\d{9,18}(?!\d)",
        ),
    ),
]


class IndianRegexExtractor(IRegexExtractor):
    """
    Deterministic regex extraction for Indian investigation entities.
    Applies patterns in priority order and deduplicates overlapping matches.
    """

    async def extract(self, text: str) -> list[ExtractedEntity]:
        results: list[ExtractedEntity] = []
        seen_spans: set[tuple[int, int]] = set()

        for pattern in _PATTERNS:
            for match in pattern.regex.finditer(text):
                start, end = match.start(), match.end()

                # Skip overlapping matches (earlier patterns have priority)
                if any(
                    s <= start < e or s < end <= e
                    for s, e in seen_spans
                ):
                    continue

                seen_spans.add((start, end))
                results.append(
                    ExtractedEntity(
                        entity_type=pattern.entity_type,
                        value=match.group(0),
                        source="regex",
                        start=start,
                        end=end,
                        confidence=1.0,
                    )
                )

        return results
