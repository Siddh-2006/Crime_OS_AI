"""
RecommendationService — orchestrates the /recommend-officers pipeline.

Algorithm:
1. Normalise complaint into structured text
2. Generate query embedding
3. Retrieve top-K similar closed FIRs from Qdrant
4. Filter results to only include available IOs (supplied by Node backend)
5. Score each officer by AVERAGE similarity across their matched cases
6. Normalise scores to 0-100 scale
7. Return sorted recommendations with human-readable reasons

Scoring is based on average cosine similarity (not cumulative sum), so an
officer who handled 2 highly-relevant cases outranks one who handled 4
loosely-related cases.
"""
import time
from collections import defaultdict

from app.core.config import settings
from app.core.logging import logger
from app.schemas.complaint import RecommendOfficersRequest
from app.schemas.recommendation import OfficerRecommendation, RecommendOfficersResponse
from app.repositories.qdrant_repository import QdrantRepository
from app.vector.embeddings.embedder import embedder
from app.utils.text_normalizer import build_complaint_text


class RecommendationService:
    def __init__(self, repository: QdrantRepository) -> None:
        self._repo = repository

    async def recommend_officers(
        self,
        request: RecommendOfficersRequest,
    ) -> RecommendOfficersResponse:
        """
        Full recommendation pipeline.
        """
        t_total = time.perf_counter()
        complaint = request.complaint
        available_officer_ids = {o.officerId for o in request.availableOfficers}

        logger.info(
            "Recommend-officers request received",
            extra={
                "complaintId": complaint.complaintId,
                "category": complaint.category,
                "stationId": complaint.stationId,
                "available_officers": len(available_officer_ids),
            },
        )

        # ── Step 1: Normalise complaint text ─────────────────────────────────
        text = build_complaint_text(
            category=complaint.category,
            sub_category=complaint.subCategory,
            location=complaint.incidentPlace,
            short_description=complaint.shortDescription,
            detailed_description=complaint.detailedDescription,
            incident_date=complaint.incidentDate,
            evidence_summary=complaint.evidenceSummary,
        )

        # ── Step 2: Embed as query ────────────────────────────────────────────
        vector = await embedder.embed_query(text)

        # ── Step 3: Search Qdrant ─────────────────────────────────────────────
        results = await self._repo.search_similar(
            vector=vector,
            top_k=settings.TOP_K_SIMILAR,
            station_id=complaint.stationId,  # restrict to same station
        )

        logger.info(
            "Qdrant results retrieved",
            extra={"count": len(results), "complaintId": complaint.complaintId},
        )

        # ── Step 4: Collect per-officer similarity lists ──────────────────────
        # Only cases whose cosine similarity meets the threshold are considered.
        # This filters out weak/irrelevant matches before scoring.
        SIMILARITY_THRESHOLD = settings.SIMILARITY_THRESHOLD

        # officer_id -> list of individual cosine similarity scores
        officer_case_sims: dict[str, list[float]] = defaultdict(list)
        # officer_id -> list of matched FIR ids (for reporting)
        officer_fir_ids: dict[str, list[str]] = defaultdict(list)

        total_cases_searched = len(results)
        cases_above_threshold = 0

        for scored_point in results:
            payload = scored_point.payload or {}
            officer_id = payload.get("officerId", "")
            fir_id = payload.get("firId", "")

            # Drop cases below the similarity threshold — not relevant enough
            if scored_point.score < SIMILARITY_THRESHOLD:
                continue

            cases_above_threshold += 1

            # Only count vectors for officers in the supplied available list
            if officer_id not in available_officer_ids:
                continue

            officer_case_sims[officer_id].append(scored_point.score)
            officer_fir_ids[officer_id].append(fir_id)

        logger.info(
            "Similarity threshold applied",
            extra={
                "threshold": SIMILARITY_THRESHOLD,
                "total_retrieved": total_cases_searched,
                "above_threshold": cases_above_threshold,
                "complaintId": complaint.complaintId,
            },
        )

        if not officer_case_sims:
            logger.info(
                "No officers matched above similarity threshold",
                extra={
                    "complaintId": complaint.complaintId,
                    "threshold": SIMILARITY_THRESHOLD,
                    "total_retrieved": total_cases_searched,
                    "above_threshold": cases_above_threshold,
                },
            )
            return RecommendOfficersResponse(
                recommendations=[],
                totalCasesSearched=total_cases_searched,
                queryCategory=complaint.category,
            )

        # ── Step 5: Score each officer by AVERAGE similarity ─────────────────
        # Average similarity rewards quality over quantity — an officer who
        # handled 2 highly-relevant cases outranks one with 4 loosely-related ones.
        officer_avg_scores: dict[str, float] = {
            oid: sum(sims) / len(sims)
            for oid, sims in officer_case_sims.items()
        }

        # ── Step 6: Normalise to 0-100 ────────────────────────────────────────
        max_avg = max(officer_avg_scores.values())

        recommendations: list[OfficerRecommendation] = []

        for officer_id, avg_score in officer_avg_scores.items():
            sims = officer_case_sims[officer_id]
            max_sim = max(sims)
            normalised = round((avg_score / max_avg) * 100.0, 2)

            reasons = [
                f"Handled {len(sims)} semantically similar closed case(s) at this station.",
                f"Average similarity of retrieved cases: {avg_score:.3f}.",
                f"Most similar closed FIR similarity score: {max_sim:.3f}.",
            ]

            recommendations.append(
                OfficerRecommendation(
                    officerId=officer_id,
                    score=normalised,
                    matchedCases=len(sims),
                    averageSimilarity=round(avg_score, 4),
                    reasons=reasons,
                )
            )

        # Sort descending by score
        recommendations.sort(key=lambda r: r.score, reverse=True)

        total_ms = round((time.perf_counter() - t_total) * 1000, 2)
        logger.info(
            "Recommend-officers pipeline complete",
            extra={
                "complaintId": complaint.complaintId,
                "recommendations_returned": len(recommendations),
                "total_ms": total_ms,
            },
        )

        return RecommendOfficersResponse(
            recommendations=recommendations,
            totalCasesSearched=total_cases_searched,
            queryCategory=complaint.category,
        )
