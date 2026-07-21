"""
Tests for IndianRegexExtractor.

Tests every entity type with realistic Indian investigation text.
No external dependencies — fully deterministic.
"""
from __future__ import annotations

import pytest

from app.text_intelligence.regex_extractor import IndianRegexExtractor


@pytest.fixture
def extractor() -> IndianRegexExtractor:
    return IndianRegexExtractor()


@pytest.mark.asyncio
async def test_phone_international_format(extractor):
    text = "Call made to +91-9876543210 at midnight."
    entities = await extractor.extract(text)
    phones = [e for e in entities if e.entity_type == "phone"]
    assert len(phones) >= 1
    assert "9876543210" in phones[0].value


@pytest.mark.asyncio
async def test_phone_10_digit_format(extractor):
    text = "The suspect's phone number is 8765432109."
    entities = await extractor.extract(text)
    phones = [e for e in entities if e.entity_type == "phone"]
    assert any("8765432109" in e.value for e in phones)


@pytest.mark.asyncio
async def test_email_extraction(extractor):
    text = "Fraudulent UPI requests came from unknownsender@fakebank.in."
    entities = await extractor.extract(text)
    emails = [e for e in entities if e.entity_type == "email"]
    assert len(emails) >= 1
    assert "unknownsender@fakebank.in" in emails[0].value


@pytest.mark.asyncio
async def test_aadhaar_extraction(extractor):
    text = "Complainant's Aadhaar number: 2345 6789 0123."
    entities = await extractor.extract(text)
    aadhaar = [e for e in entities if e.entity_type == "aadhaar"]
    assert len(aadhaar) == 1
    assert "2345 6789 0123" in aadhaar[0].value


@pytest.mark.asyncio
async def test_pan_extraction(extractor):
    text = "PAN card number ABCDE1234F was found in the documents."
    entities = await extractor.extract(text)
    pans = [e for e in entities if e.entity_type == "pan"]
    assert len(pans) == 1
    assert pans[0].value == "ABCDE1234F"


@pytest.mark.asyncio
async def test_upi_id_extraction(extractor):
    text = "Amount was sent to victim@paytm using UPI."
    entities = await extractor.extract(text)
    upi = [e for e in entities if e.entity_type == "upi_id"]
    assert any("victim@paytm" in e.value for e in upi)


@pytest.mark.asyncio
async def test_ifsc_extraction(extractor):
    text = "Money was deposited via IFSC code SBIN0001234."
    entities = await extractor.extract(text)
    ifsc = [e for e in entities if e.entity_type == "ifsc"]
    assert len(ifsc) == 1
    assert ifsc[0].value == "SBIN0001234"


@pytest.mark.asyncio
async def test_vehicle_number_extraction(extractor):
    text = "The suspect fled in a vehicle with number plate GJ01AB1234."
    entities = await extractor.extract(text)
    vehicles = [e for e in entities if e.entity_type == "vehicle_number"]
    assert len(vehicles) == 1
    assert "GJ01AB1234" in vehicles[0].value


@pytest.mark.asyncio
async def test_amount_rupee_symbol(extractor):
    text = "Victim lost ₹48,000 in the scam."
    entities = await extractor.extract(text)
    amounts = [e for e in entities if e.entity_type == "amount"]
    assert len(amounts) == 1
    assert "48,000" in amounts[0].value


@pytest.mark.asyncio
async def test_amount_rs_prefix(extractor):
    text = "The complainant paid Rs. 1,20,000 to the fraudster."
    entities = await extractor.extract(text)
    amounts = [e for e in entities if e.entity_type == "amount"]
    assert len(amounts) == 1
    assert "1,20,000" in amounts[0].value


@pytest.mark.asyncio
async def test_date_numeric_format(extractor):
    text = "The incident occurred on 12/07/2026."
    entities = await extractor.extract(text)
    dates = [e for e in entities if e.entity_type == "date"]
    assert any("12/07/2026" in e.value for e in dates)


@pytest.mark.asyncio
async def test_date_natural_language(extractor):
    text = "The fraud took place on 12 July 2026 at 14:00."
    entities = await extractor.extract(text)
    dates = [e for e in entities if e.entity_type == "date"]
    times = [e for e in entities if e.entity_type == "time"]
    assert any("July" in e.value for e in dates)
    assert len(times) >= 1


@pytest.mark.asyncio
async def test_transaction_ref_extraction(extractor):
    text = "Transaction RRN 402198337210 was processed by the bank."
    entities = await extractor.extract(text)
    refs = [e for e in entities if e.entity_type == "transaction_ref"]
    assert len(refs) == 1
    assert "402198337210" in refs[0].value


@pytest.mark.asyncio
async def test_multiple_entities_in_one_text(extractor):
    text = (
        "Complainant Rakesh Patel reports Rs. 48,000 debited from account "
        "via unauthorized UPI request on 12 July 2026. "
        "Phone +91-9876543210. UPI ID: victim@ybl. RRN 402198337210."
    )
    entities = await extractor.extract(text)
    types_found = {e.entity_type for e in entities}
    assert "amount" in types_found
    assert "date" in types_found
    assert "phone" in types_found
    assert "transaction_ref" in types_found


@pytest.mark.asyncio
async def test_entity_source_is_regex(extractor):
    text = "Phone: +91-9876543210."
    entities = await extractor.extract(text)
    assert all(e.source == "regex" for e in entities)
    assert all(e.confidence == 1.0 for e in entities)


@pytest.mark.asyncio
async def test_empty_text_returns_empty_list(extractor):
    entities = await extractor.extract("")
    assert entities == []


@pytest.mark.asyncio
async def test_no_entities_in_plain_text(extractor):
    text = "The quick brown fox jumps over the lazy dog."
    entities = await extractor.extract(text)
    # No Indian investigation entities expected
    assert len(entities) == 0
