from abc import ABC, abstractmethod
from app.evidence.context import EvidenceContext


class EvidenceProcessor(ABC):
    """
    Base interface that all evidence pipeline processors must implement.
    Each processor does one specific task (e.g., metadata extraction, OCR, tagging)
    by reading and writing to the shared mutable EvidenceContext.
    """

    @abstractmethod
    async def process(self, context: EvidenceContext) -> EvidenceContext:
        """
        Processes the given context and returns the updated context.
        """
        pass
