"""
Interface for the Timeline Intelligence Engine (M11).

ITimelineIntelligenceEngine defines the contract consumed by the FastAPI route
and any downstream module (e.g. M12 Investigation Intelligence).
The concrete implementation depends solely on ILLMClient, keeping the business
layer fully model-agnostic.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from app.schemas.timeline_intelligence import (
    TimelineIntelligence,
    TimelineIntelligenceInput,
)


class ITimelineIntelligenceEngine(ABC):
    """Contract for the Timeline Intelligence Engine."""

    @abstractmethod
    async def analyze(self, payload: TimelineIntelligenceInput) -> TimelineIntelligence:
        """
        Analyze a deterministic timeline using LLM-guided reasoning.

        Inputs (strict — no additional data may be introduced):
            - ComplaintProfile
            - Timeline (M10 output)
            - EvidenceRef list

        Returns a TimelineIntelligence artifact containing:
            - Refined timeline entries (improved wording, resolved actors)
            - Contradictions detected
            - Inferred causal relationships
            - Missing timestamp highlights
            - Coherent chronological narrative summary
        """
        ...
