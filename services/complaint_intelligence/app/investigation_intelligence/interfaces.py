"""
Interfaces for Milestone 12 — Investigation Intelligence Engine.
"""
from abc import ABC, abstractmethod

from app.schemas.investigation_intelligence import (
    InvestigationIntelligence,
    InvestigationIntelligenceInput,
)


class IInvestigationIntelligenceEngine(ABC):
    """Abstract contract for the Investigation Intelligence Engine."""

    @abstractmethod
    async def analyze(
        self, payload: InvestigationIntelligenceInput
    ) -> InvestigationIntelligence:
        """
        Analyze the Complaint Profile, Evidence Profiles, and Timeline Intelligence
        to generate a structured, semantically enriched Investigation Intelligence representation.

        Must adhere strictly to anti-hallucination guarantees and degrade gracefully on LLM failure.
        """
        pass
