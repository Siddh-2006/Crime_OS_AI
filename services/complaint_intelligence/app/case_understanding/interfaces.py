"""
Interfaces for Case Understanding module.
Defines contracts for Context Builder, Case Engine, and Repository.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from app.schemas.case_context import CaseContext, EvidenceItem
from app.schemas.case_understanding import CaseUnderstanding


class ICaseContextBuilder(ABC):
    """Aggregates complaint text and evidence profiles into a single CaseContext."""

    @abstractmethod
    def build(
        self,
        complaint_text: str,
        evidence_items: List[EvidenceItem],
        case_id: Optional[str] = None,
        complaint_metadata: Optional[Dict[str, Any]] = None,
    ) -> CaseContext:
        ...


class ICaseUnderstandingEngine(ABC):
    """
    Executes the single LLM invocation over CaseContext to produce a structured CaseUnderstanding JSON.
    """

    @abstractmethod
    async def analyze(self, context: CaseContext) -> CaseUnderstanding:
        ...


class ICaseRepository(ABC):
    """Persistence contract for storing and retrieving CaseUnderstanding objects."""

    @abstractmethod
    async def save(self, case: CaseUnderstanding) -> str:
        ...

    @abstractmethod
    async def get_by_id(self, case_id: str) -> Optional[CaseUnderstanding]:
        ...
