"""
EmbedService — orchestrates the embed-case pipeline.

Single responsibility: given a validated EmbedCaseRequest, produce structured
text, generate an embedding, and store the vector in Qdrant.
"""
import time

from app.core.logging import logger
from app.schemas.fir import EmbedCaseRequest, EmbedCaseResponse
from app.repositories.qdrant_repository import QdrantRepository
from app.vector.embeddings.embedder import embedder
from app.utils.text_normalizer import build_fir_text


class EmbedService:
    def __init__(self, repository: QdrantRepository) -> None:
        self._repo = repository

    async def embed_case(self, request: EmbedCaseRequest) -> EmbedCaseResponse:
        """
        Full pipeline:
        1. Normalise FIR fields into structured text
        2. Generate embedding via llama.cpp
        3. Upsert into Qdrant (idempotent)
        4. Return EmbedCaseResponse
        """
        t_total = time.perf_counter()

        logger.info(
            "Embed-case request received",
            extra={
                "firId": request.firId,
                "firNumber": request.firNumber,
                "category": request.crimeCategory,
                "officerId": request.officerId,
            },
        )

        text = build_fir_text(
            crime_category=request.crimeCategory,
            crime_sub_category=request.crimeSubCategory,
            location=request.location,
            incident_summary=request.incidentSummary,
            modus_operandi=request.modusOperandi,
            evidence_summary=request.evidenceSummary,
            investigation_summary=request.investigationSummary,
            sections=request.sections,
            created_at=request.createdAt,
            closed_date=request.closedDate,
            complaint_intelligence=request.complaintIntelligence,
            diary_entries=request.diaryEntries,
            case_checklist=request.caseChecklist,
            case_entities=request.caseEntities,
            analysis_snapshots=request.analysisSnapshots,
            department_requests=request.departmentRequests,
            charge_sheet=request.chargeSheet,
        )

        logger.info(
            "FIR text normalised",
            extra={"firId": request.firId, "text_length": len(text)},
        )

        # ── Step 2: Generate embedding (document-side prefix) ────────────────
        vector = await embedder.embed_document(text)

        # ── Step 3: Build Qdrant payload (metadata only, no IDs in vector) ───
        payload = {
            "firId": request.firId,
            "complaintId": request.complaintId,
            "officerId": request.officerId,
            "stationId": request.stationId,
            "district": request.district,
            "firNumber": request.firNumber,
            "crimeCategory": request.crimeCategory,
            "crimeSubCategory": request.crimeSubCategory,
            "status": request.status,
            "closedDate": request.closedDate,
            "createdAt": request.createdAt,
        }

        # ── Step 4: Upsert vector ────────────────────────────────────────────
        action = await self._repo.upsert(
            fir_id=request.firId,
            vector=vector,
            payload=payload,
        )

        total_ms = round((time.perf_counter() - t_total) * 1000, 2)
        logger.info(
            "Embed-case pipeline complete",
            extra={
                "firId": request.firId,
                "action": action,
                "total_ms": total_ms,
            },
        )

        return EmbedCaseResponse(
            success=True,
            firId=request.firId,
            message=f"Case {request.firNumber} successfully {action} in vector store.",
            action=action,
        )
