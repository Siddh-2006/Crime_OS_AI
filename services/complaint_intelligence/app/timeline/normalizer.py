"""
Deterministic Timestamp Normalizer — Milestone 10.

Parses date/time strings WITHOUT AN LLM. Uses:
  1. ISO 8601 regex & datetime.fromisoformat
  2. Standard Indian / International format patterns (DD/MM/YYYY, YYYY-MM-DD, 12h AM/PM)
  3. python-dateutil parser fallback

Produces normalized ISO-8601 UTC timestamps and structured ParsedDateTime models.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from dateutil import parser as dateutil_parser

from app.schemas.timeline import ParsedDateTime, TimestampPrecision
from app.timeline.interfaces import ITimestampNormalizer

_ISO_REGEX = re.compile(
    r"^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$",
    re.IGNORECASE,
)

# Common patterns for quick pattern matching
_DATE_ONLY_REGEX = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_INDIAN_DATE_REGEX = re.compile(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$")
_YEAR_MONTH_REGEX = re.compile(r"^\d{4}-\d{2}$")
_YEAR_ONLY_REGEX = re.compile(r"^\d{4}$")


class DeterministicTimestampNormalizer(ITimestampNormalizer):
    """
    100% Deterministic timestamp normalizer.
    No LLM calls. Fully reproducible date/time parsing.
    """

    def parse(self, raw_timestamp: str | None) -> ParsedDateTime:
        if not raw_timestamp or not raw_timestamp.strip():
            return ParsedDateTime(raw_text="", precision=TimestampPrecision.UNPARSED)

        raw = raw_timestamp.strip()

        # ── 1. Year only (e.g. "2026") ────────────────────────────────────────
        if _YEAR_ONLY_REGEX.match(raw):
            yr = int(raw)
            dt = datetime(yr, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
            return ParsedDateTime(
                iso_timestamp_utc=dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                year=yr,
                month=1,
                day=1,
                precision=TimestampPrecision.YEAR,
                raw_text=raw,
            )

        # ── 2. Year-Month only (e.g. "2026-07") ─────────────────────────────
        if _YEAR_MONTH_REGEX.match(raw):
            yr, mo = map(int, raw.split("-"))
            dt = datetime(yr, mo, 1, 0, 0, 0, tzinfo=timezone.utc)
            return ParsedDateTime(
                iso_timestamp_utc=dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                year=yr,
                month=mo,
                day=1,
                precision=TimestampPrecision.MONTH,
                raw_text=raw,
            )

        # ── 3. Date only ISO (e.g. "2026-07-20") ────────────────────────────
        if _DATE_ONLY_REGEX.match(raw):
            yr, mo, dy = map(int, raw.split("-"))
            dt = datetime(yr, mo, dy, 0, 0, 0, tzinfo=timezone.utc)
            return ParsedDateTime(
                iso_timestamp_utc=dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                year=yr,
                month=mo,
                day=dy,
                precision=TimestampPrecision.DAY,
                raw_text=raw,
            )

        # ── 4. Indian format DD/MM/YYYY or DD-MM-YYYY ─────────────────────────
        m_ind = _INDIAN_DATE_REGEX.match(raw)
        if m_ind:
            dy, mo, yr = map(int, m_ind.groups())
            try:
                dt = datetime(yr, mo, dy, 0, 0, 0, tzinfo=timezone.utc)
                return ParsedDateTime(
                    iso_timestamp_utc=dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    year=yr,
                    month=mo,
                    day=dy,
                    precision=TimestampPrecision.DAY,
                    raw_text=raw,
                )
            except ValueError:
                pass

        # ── 5. General parsing with dateutil ──────────────────────────────────
        try:
            # dayfirst=True to prefer DD/MM/YYYY for Indian contexts
            dt = dateutil_parser.parse(raw, dayfirst=True)
            # If timezone is naive, assume UTC
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            else:
                dt = dt.astimezone(timezone.utc)

            # Determine precision
            precision = TimestampPrecision.SECOND
            if dt.second == 0 and dt.microsecond == 0:
                precision = TimestampPrecision.MINUTE
            if dt.hour == 0 and dt.minute == 0 and dt.second == 0:
                precision = TimestampPrecision.DAY

            iso_str = dt.strftime("%Y-%m-%dT%H:%M:%SZ")
            return ParsedDateTime(
                iso_timestamp_utc=iso_str,
                year=dt.year,
                month=dt.month,
                day=dt.day,
                hour=dt.hour,
                minute=dt.minute,
                second=dt.second,
                precision=precision,
                raw_text=raw,
            )
        except Exception:
            # Unparseable timestamp fallback
            return ParsedDateTime(raw_text=raw, precision=TimestampPrecision.UNPARSED)


class MockTimestampNormalizer(ITimestampNormalizer):
    """Mock timestamp normalizer for testing."""

    def __init__(self, fixed_result: ParsedDateTime | None = None) -> None:
        self._fixed_result = fixed_result

    def parse(self, raw_timestamp: str | None) -> ParsedDateTime:
        if self._fixed_result is not None:
            return self._fixed_result
        return DeterministicTimestampNormalizer().parse(raw_timestamp)
