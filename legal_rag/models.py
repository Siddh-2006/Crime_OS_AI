from __future__ import annotations

from dataclasses import dataclass, field
from uuid import uuid4
from typing import Any, Literal

from ingestion.schemas import LegalSectionRecord

ConfidenceLevel = Literal["LOW", "MEDIUM", "HIGH"]


@dataclass(slots=True)
class EmbeddedLegalRecord:
    record: LegalSectionRecord
    embedding_text: str
    embedding: list[float] = field(default_factory=list)
    uuid: str = field(default_factory=lambda: str(uuid4()))

    def to_payload(self) -> dict[str, Any]:
        return self.record.model_dump(exclude_none=True, mode="json")

    def to_json_dict(self) -> dict[str, Any]:
        data = {
            "record": self.record.model_dump(exclude_none=True, mode="json"),
            "embedding_text": self.embedding_text,
            "embedding": self.embedding,
            "uuid": self.uuid,
        }
        return data


@dataclass(slots=True)
class LegalRetrievalResult:
    record: LegalSectionRecord
    retrieval_score: float = 0.0
    rerank_score: float = 0.0
    context_type: str = "retrieved_section"

    @property
    def act(self) -> str:
        return self.record.act

    @property
    def serial_number(self) -> str:
        return self.record.serial_number

    @property
    def section_key(self) -> str:
        return f"{self.record.act}_{self.record.serial_number}"

    def to_section_block(self) -> str:
        referenced = ", ".join(self.record.references) if self.record.references else "None"
        chapter = self.record.chapter or "None"
        content = self.record.content.strip() or "None"
        return (
            f"Section:\n"
            f"Section ID: {self.section_key}\n"
            f"Act: {self.record.act}\n"
            f"Chapter: {chapter}\n"
            f"Content: {content}\n"
            f"Referenced: {referenced}\n"
            f"Context Type: {self.context_type}\n"
        )


@dataclass(slots=True)
class ConfidenceSummary:
    score: float = 0.0
    level: ConfidenceLevel = "LOW"


@dataclass(slots=True)
class MatchedElement:
    legal_element: str
    complaint_fact: str


@dataclass(slots=True)
class SectionExplanation:
    section: str
    matched_elements: list[MatchedElement] = field(default_factory=list)


@dataclass(slots=True)
class ReasoningClaim:
    claim: str
    citations: list[str] = field(default_factory=list)


@dataclass(slots=True)
class ApplicableSection:
    act: str
    section: str
    relevance_score: float = 0.0


@dataclass(slots=True)
class SupportingSection:
    section: str
    context_type: str = "referenced_section"


@dataclass(slots=True)
class LegalAnalysisResult:
    query: str
    confidence: ConfidenceSummary = field(default_factory=ConfidenceSummary)
    applicable_sections: list[ApplicableSection] = field(default_factory=list)
    explanation: list[SectionExplanation] = field(default_factory=list)
    reasoning: list[ReasoningClaim] = field(default_factory=list)
    supporting_sections: list[SupportingSection] = field(default_factory=list)
    review_note: str | None = None

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "query": self.query,
            "confidence": {
                "score": round(self.confidence.score, 3),
                "level": self.confidence.level,
            },
            "applicable_sections": [
                {
                    "act": item.act,
                    "section": item.section,
                    "relevance_score": round(item.relevance_score, 3),
                }
                for item in self.applicable_sections
            ],
            "explanation": [
                {
                    "section": item.section,
                    "matched_elements": [
                        {
                            "legal_element": element.legal_element,
                            "complaint_fact": element.complaint_fact,
                        }
                        for element in item.matched_elements
                    ],
                }
                for item in self.explanation
            ],
            "reasoning": [
                {
                    "claim": item.claim,
                    "citations": list(item.citations),
                }
                for item in self.reasoning
            ],
            "supporting_sections": [
                {
                    "section": item.section,
                    "context_type": item.context_type,
                }
                for item in self.supporting_sections
            ],
            **({"review_note": self.review_note} if self.review_note else {}),
        }


@dataclass(slots=True)
class LegalRetrievalBundle:
    complaint: str
    top_20: list[LegalRetrievalResult] = field(default_factory=list)
    top_5: list[LegalRetrievalResult] = field(default_factory=list)
    context_sections: list[LegalRetrievalResult] = field(default_factory=list)

    def all_context_sections(self) -> list[LegalRetrievalResult]:
        return [*self.top_5, *self.context_sections]

    def prompt_sections_text(self) -> str:
        ordered = self.all_context_sections()
        if not ordered:
            return ""
        blocks = [section.to_section_block().strip() for section in ordered]
        return "\n\n".join(blocks)
