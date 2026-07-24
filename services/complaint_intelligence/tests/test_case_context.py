"""
Unit tests for CaseContext schema and builder.
"""
from app.case_understanding.context_builder import CaseContextBuilder
from app.schemas.case_context import CaseContext, EvidenceItem


def test_evidence_item_creation():
    item = EvidenceItem(
        filename="bank_statement.pdf",
        type="pdf",
        pdf_text="Transaction of RS 25000 to Rajesh Kumar",
        metadata={"pages": 1},
    )
    assert item.filename == "bank_statement.pdf"
    assert item.type == "pdf"
    assert item.pdf_text == "Transaction of RS 25000 to Rajesh Kumar"
    assert item.metadata == {"pages": 1}
    assert item.id is not None


def test_case_context_builder():
    builder = CaseContextBuilder()
    item = EvidenceItem(
        filename="call_recording.mp3",
        type="audio",
        transcript="Scammer asked for OTP",
    )
    context = builder.build(
        complaint_text="My money was stolen via fraud call.",
        evidence_items=[item],
        case_id="case-1234",
        complaint_metadata={"district": "Surat"},
    )
    assert context.case_id == "case-1234"
    assert context.complaint_text == "My money was stolen via fraud call."
    assert len(context.evidence) == 1
    assert context.evidence[0].transcript == "Scammer asked for OTP"
    assert context.complaint_metadata["district"] == "Surat"
