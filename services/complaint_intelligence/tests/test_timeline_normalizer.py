"""
Unit tests for DeterministicTimestampNormalizer (M10).

Covers edge cases:
  - ISO 8601 UTC ('2026-07-20T10:00:00Z')
  - ISO 8601 with offset ('2026-07-20T15:30:00+05:30')
  - Indian DD/MM/YYYY format ('20/07/2026')
  - Date only ('2026-07-20')
  - Year-Month only ('2026-07')
  - Year only ('2026')
  - 12-hour AM/PM formats ('July 20, 2026 10:15 AM')
  - Unparseable / empty strings ('sometime last week', '', None)
"""
from __future__ import annotations

import pytest

from app.schemas.timeline import TimestampPrecision
from app.timeline.normalizer import DeterministicTimestampNormalizer


@pytest.fixture
def normalizer() -> DeterministicTimestampNormalizer:
    return DeterministicTimestampNormalizer()


@pytest.mark.unit
def test_parse_iso_utc(normalizer):
    res = normalizer.parse("2026-07-20T10:00:00Z")
    assert res.iso_timestamp_utc == "2026-07-20T10:00:00Z"
    assert res.year == 2026
    assert res.month == 7
    assert res.day == 20
    assert res.hour == 10
    assert res.minute == 0
    assert res.precision != TimestampPrecision.UNPARSED


@pytest.mark.unit
def test_parse_iso_with_timezone_offset(normalizer):
    # 15:30 IST (+05:30) is 10:00 UTC
    res = normalizer.parse("2026-07-20T15:30:00+05:30")
    assert res.iso_timestamp_utc == "2026-07-20T10:00:00Z"
    assert res.year == 2026
    assert res.month == 7
    assert res.day == 20


@pytest.mark.unit
def test_parse_indian_date_slash(normalizer):
    res = normalizer.parse("20/07/2026")
    assert res.iso_timestamp_utc == "2026-07-20T00:00:00Z"
    assert res.year == 2026
    assert res.month == 7
    assert res.day == 20
    assert res.precision == TimestampPrecision.DAY


@pytest.mark.unit
def test_parse_date_only_iso(normalizer):
    res = normalizer.parse("2026-07-20")
    assert res.iso_timestamp_utc == "2026-07-20T00:00:00Z"
    assert res.precision == TimestampPrecision.DAY


@pytest.mark.unit
def test_parse_year_month_only(normalizer):
    res = normalizer.parse("2026-07")
    assert res.iso_timestamp_utc == "2026-07-01T00:00:00Z"
    assert res.precision == TimestampPrecision.MONTH


@pytest.mark.unit
def test_parse_year_only(normalizer):
    res = normalizer.parse("2026")
    assert res.iso_timestamp_utc == "2026-01-01T00:00:00Z"
    assert res.precision == TimestampPrecision.YEAR


@pytest.mark.unit
def test_parse_ampm_string(normalizer):
    res = normalizer.parse("July 20, 2026 10:15 AM")
    assert res.iso_timestamp_utc == "2026-07-20T10:15:00Z"
    assert res.hour == 10
    assert res.minute == 15


@pytest.mark.unit
def test_parse_unparseable_string(normalizer):
    res = normalizer.parse("sometime early last week")
    assert res.iso_timestamp_utc is None
    assert res.precision == TimestampPrecision.UNPARSED
    assert res.raw_text == "sometime early last week"


@pytest.mark.unit
def test_parse_empty_and_none(normalizer):
    res1 = normalizer.parse("")
    assert res1.precision == TimestampPrecision.UNPARSED

    res2 = normalizer.parse(None)
    assert res2.precision == TimestampPrecision.UNPARSED
