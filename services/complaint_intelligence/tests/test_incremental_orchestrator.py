"""
Unit tests for IncrementalPipelineOrchestrator and Profile Repositories.
Verifies decoupled complaint registration, per-evidence worker idempotency,
and living CaseIntelligence evolution.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock

from app.case_understanding.incremental_orchestrator import IncrementalPipelineOrchestrator
from app.case_understanding.profile_repository import (
    MongoComplaintProfileRepository,
    MongoEvidenceProfileRepository,
)
from app.core.container import Container
from app.schemas.case_understanding import CaseUnderstanding, Overview
from tests.image_test_utils import make_jpeg_bytes


@pytest.fixture
def mock_container():
    c = MagicMock(spec=Container)
    c.complaint_profile_repository = MongoComplaintProfileRepository(use_in_memory=True)
    c.evidence_profile_repository = MongoEvidenceProfileRepository(use_in_memory=True)
    
    # Mock CaseRepository
    mock_case_repo = AsyncMock()
    mock_case_repo.save = AsyncMock()
    mock_case_repo.get_by_case_id = AsyncMock(return_value=None)
    c.case_repository = mock_case_repo

    # Mock CaseUnderstandingEngine
    mock_engine = AsyncMock()
    dummy_cu = CaseUnderstanding(
        case_id="case-100",
        overview=Overview(
            complaint_summary="Test fraud complaint",
            incident_overview="Victim tricked into sending money",
            crime_category="Cybercrime",
            crime_subtype="Online Banking Fraud",
            priority="high",
            confidence=0.95,
        ),
        original_complaint="I lost 50000 rupees to scammer",
    )
    mock_engine.analyze = AsyncMock(return_value=dummy_cu)
    c.case_understanding_engine = mock_engine

    # Mock ImageWorker
    mock_img_worker = AsyncMock()
    mock_img_worker.run = AsyncMock(return_value=MagicMock(
        succeeded=True,
        output={"analysis": {"description": "Screenshot of bank transfer"}}
    ))
    c.image_worker = mock_img_worker

    # Mock OCRWorker
    mock_ocr_worker = AsyncMock()
    mock_ocr_worker.run = AsyncMock(return_value=MagicMock(
        succeeded=True,
        output={"ocr_result": {"raw_text": "Rs. 50000 debited from A/c XXXX7890"}}
    ))
    c.ocr_worker = mock_ocr_worker

    return c


@pytest.mark.asyncio
async def test_register_complaint_creates_profile(mock_container):
    orchestrator = IncrementalPipelineOrchestrator(container=mock_container)
    profile, case_cu = await orchestrator.register_complaint(
        case_id="case-100",
        complaint_text="I lost 50000 rupees to scammer via fake customer care call",
        complaint_number="COMP-001",
    )

    assert profile.case_id == "case-100"
    assert profile.complaint_number == "COMP-001"
    assert profile.original_text.startswith("I lost 50000")

    # Verify repository saved
    saved_profile = await mock_container.complaint_profile_repository.get_by_case_id("case-100")
    assert saved_profile is not None
    assert saved_profile.case_id == "case-100"


@pytest.mark.asyncio
async def test_incremental_evidence_upload_and_idempotency(mock_container):
    orchestrator = IncrementalPipelineOrchestrator(container=mock_container)
    
    # 1. Register Complaint
    await orchestrator.register_complaint(
        case_id="case-100",
        complaint_text="Victim lost money in fake call",
    )

    # 2. Upload Evidence #1 (Image)
    jpeg_bytes = make_jpeg_bytes()
    ev1_profile, cu1 = await orchestrator.process_incremental_evidence(
        case_id="case-100",
        filename="screenshot1.jpg",
        content_type="image/jpeg",
        file_bytes=jpeg_bytes,
        evidence_id="ev-001",
    )

    assert ev1_profile.evidence_id == "ev-001"
    assert ev1_profile.media_type == "image"
    assert mock_container.image_worker.run.call_count == 1

    # Verify EvidenceProfile #1 is saved
    saved_ev1 = await mock_container.evidence_profile_repository.get_by_evidence_id("ev-001")
    assert saved_ev1 is not None

    # 3. Idempotency Check: Re-uploading Evidence #1 MUST skip ImageWorker
    mock_container.image_worker.run.reset_mock()
    ev1_profile_again, _ = await orchestrator.process_incremental_evidence(
        case_id="case-100",
        filename="screenshot1.jpg",
        content_type="image/jpeg",
        file_bytes=jpeg_bytes,
        evidence_id="ev-001",
        force_reprocess=False,
    )

    # Worker was NOT called again because EvidenceProfile already exists!
    assert mock_container.image_worker.run.call_count == 0
    assert ev1_profile_again.evidence_id == "ev-001"

    # 4. Upload Evidence #2 (PDF)
    pdf_bytes = b"%PDF-1.4 mock pdf content"
    mock_pdf_worker = AsyncMock()
    mock_pdf_worker.run = AsyncMock(return_value=MagicMock(
        succeeded=True,
        output={"extracted_text": "Official Bank Statement showing ₹50,000 debit"}
    ))
    mock_container.pdf_worker = mock_pdf_worker

    ev2_profile, cu2 = await orchestrator.process_incremental_evidence(
        case_id="case-100",
        filename="bank_statement.pdf",
        content_type="application/pdf",
        file_bytes=pdf_bytes,
        evidence_id="ev-002",
    )

    assert ev2_profile.evidence_id == "ev-002"
    assert ev2_profile.media_type == "pdf"
    assert mock_pdf_worker.run.call_count == 1

    # Verify total evidence profiles accumulated for case-100 is 2
    all_ev = await mock_container.evidence_profile_repository.get_all_for_case("case-100")
    assert len(all_ev) == 2
