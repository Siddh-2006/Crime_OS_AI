from __future__ import annotations

from dataclasses import asdict, dataclass, field, is_dataclass
from datetime import datetime, timezone
from typing import Any, ClassVar, Literal
from uuid import uuid4

from ingestion.schemas import DeptRegistryRecord, LegalSectionRecord, SOPRecord

try:  # pragma: no cover - exercised when dependency exists
    from pydantic import BaseModel, ConfigDict, Field
except Exception:  # pragma: no cover - fallback for offline environments
    class _FieldSpec:
        def __init__(self, default: Any = None, default_factory: Any = None) -> None:
            self.default = default
            self.default_factory = default_factory

        def resolve(self) -> Any:
            if self.default_factory is not None:
                return self.default_factory()
            return self.default

    class BaseModel:  # type: ignore[override]
        model_config: ClassVar[dict[str, Any]] = {}

        def __init__(self, **data: Any) -> None:
            annotations = getattr(self.__class__, "__annotations__", {})
            for key in annotations:
                class_value = getattr(self.__class__, key, None)
                if isinstance(class_value, _FieldSpec):
                    value = class_value.resolve()
                elif hasattr(self.__class__, key):
                    value = class_value
                else:
                    value = None
                setattr(self, key, data.pop(key, value))
            for key, value in data.items():
                setattr(self, key, value)

        @classmethod
        def model_validate(cls, data: Any):
            if isinstance(data, cls):
                return data
            if is_dataclass(data):
                return cls(**asdict(data))
            if isinstance(data, dict):
                return cls(**data)
            raise TypeError(f"Cannot validate {type(data)!r}")

        def model_dump(self, *, mode: str | None = None, exclude_none: bool = False) -> dict[str, Any]:
            def _serialize(value: Any) -> Any:
                if isinstance(value, BaseModel):
                    return value.model_dump(exclude_none=exclude_none)
                if is_dataclass(value):
                    return asdict(value)
                if isinstance(value, list):
                    return [_serialize(item) for item in value]
                if isinstance(value, tuple):
                    return [_serialize(item) for item in value]
                if isinstance(value, dict):
                    return {key: _serialize(item) for key, item in value.items()}
                if hasattr(value, "isoformat"):
                    try:
                        return value.isoformat()
                    except Exception:
                        return value
                return value

            data = dict(self.__dict__)
            if exclude_none:
                data = {key: value for key, value in data.items() if value is not None}
            return {key: _serialize(value) for key, value in data.items()}

        def model_dump_json(self, *, indent: int | None = None) -> str:
            import json

            return json.dumps(self.model_dump(exclude_none=True), ensure_ascii=False, indent=indent)

        def json(self, *, indent: int | None = None) -> str:
            return self.model_dump_json(indent=indent)

    def Field(default: Any = None, *, default_factory: Any | None = None, **_: Any) -> Any:  # type: ignore[misc]
        return _FieldSpec(default=default, default_factory=default_factory)

    class ConfigDict(dict):
        pass


ConfidenceLevel = Literal["LOW", "MEDIUM", "HIGH"]
ParsedDocument = LegalSectionRecord | DeptRegistryRecord | SOPRecord


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _to_payload(value: Any) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump(exclude_none=True, mode="json")
    if is_dataclass(value):
        return asdict(value)
    if isinstance(value, dict):
        return dict(value)
    raise TypeError(f"Cannot serialize payload of type {type(value)!r}")


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return "\n".join(str(item).strip() for item in value if str(item).strip())
    return str(value).strip()


def _normalize_csv(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return ", ".join(str(item).strip() for item in value if str(item).strip())
    return str(value).strip()


def _infer_schema_name(payload: dict[str, Any]) -> str:
    if "serial_number" in payload or "chapter_tag" in payload:
        return "legal"
    if "entity_name" in payload and "what_they_can_provide" in payload:
        return "dept_registry"
    if "sop_id" in payload or "crime_type" in payload or "steps" in payload:
        return "sop"
    return "generic"


def _identifier_field(schema_name: str) -> str:
    if schema_name == "legal":
        return "serial_number"
    if schema_name == "dept_registry":
        return "entity_id"
    if schema_name == "sop":
        return "sop_id"
    return "id"


def _identifier_value(payload: dict[str, Any], schema_name: str) -> str:
    field_name = _identifier_field(schema_name)
    value = payload.get(field_name)
    if value is None and schema_name == "legal":
        value = payload.get("id")
    if value is None:
        value = payload.get("id")
    return str(value or "").strip()


def _legal_bm25_text(payload: dict[str, Any]) -> str:
    parts = [
        _normalize_text(payload.get("chapter_tag")),
        _normalize_text(payload.get("summary")),
        _normalize_text(payload.get("content")),
    ]
    return "\n".join(part for part in parts if part)


def _dept_bm25_text(payload: dict[str, Any]) -> str:
    fields = [
        "act",
        "entity_name",
        "category",
        "what_they_can_provide",
        "legal_basis_typically_cited",
        "request_format_expected",
        "typical_response_time",
        "escalation_path_if_no_response",
        "notes_or_caveats",
    ]
    parts: list[str] = []
    for field_name in fields:
        value = payload.get(field_name)
        if field_name in {"what_they_can_provide", "legal_basis_typically_cited"}:
            value = _normalize_csv(value)
        else:
            value = _normalize_text(value)
        if value:
            parts.append(value)
    return "\n".join(parts)


def _sop_bm25_text(payload: dict[str, Any]) -> str:
    parts: list[str] = []
    crime_type = _normalize_text(payload.get("crime_type"))
    title = _normalize_text(payload.get("title"))
    if crime_type:
        parts.extend([crime_type, crime_type])
    if title:
        parts.extend([title, title])

    for step in payload.get("steps", []) or []:
        if not isinstance(step, dict):
            continue
        parts.extend(
            [
                _normalize_text(step.get("title")),
                _normalize_text(step.get("description")),
                _normalize_csv(step.get("required_evidence")),
                _normalize_text(step.get("legal_basis")),
                _normalize_text(step.get("department_entity_id")),
                _normalize_text(step.get("condition_to_start")),
                _normalize_text(step.get("condition_to_complete")),
                _normalize_csv(step.get("if_blocked")),
            ]
        )

    for strategy in payload.get("dead_end_strategies", []) or []:
        if not isinstance(strategy, dict):
            continue
        parts.append(_normalize_text(strategy.get("condition")))
        parts.append(_normalize_csv(strategy.get("suggested_actions")))

    return "\n".join(part for part in parts if part)


def _legal_prompt_block(payload: dict[str, Any], *, context_type: str) -> str:
    chapter = _normalize_text(payload.get("chapter")) or "None"
    chapter_tag = _normalize_csv(payload.get("chapter_tag")) or "None"
    summary = _normalize_text(payload.get("summary")) or "None"
    content = _normalize_text(payload.get("content")) or "None"
    references = _normalize_csv(payload.get("references")) or "None"
    pages = _normalize_csv(payload.get("page_numbers")) or "None"
    return (
        "Section:\n"
        f"Section ID: {payload.get('act', '')}_{_identifier_value(payload, 'legal')}\n"
        f"Act: {_normalize_text(payload.get('act'))}\n"
        f"Chapter: {chapter}\n"
        f"Chapter Tags: {chapter_tag}\n"
        f"Summary: {summary}\n"
        f"Content: {content}\n"
        f"Referenced: {references}\n"
        f"Page Numbers: {pages}\n"
        f"Context Type: {context_type}\n"
    )


def _dept_prompt_block(payload: dict[str, Any], *, context_type: str) -> str:
    def _join_field(name: str) -> str:
        return _normalize_csv(payload.get(name)) or "None"

    return (
        "Department Registry Entry:\n"
        f"Entry ID: {payload.get('act', '')}_{_identifier_value(payload, 'dept_registry')}\n"
        f"Act: {_normalize_text(payload.get('act'))}\n"
        f"Entity Name: {_normalize_text(payload.get('entity_name')) or 'None'}\n"
        f"Category: {_normalize_text(payload.get('category')) or 'None'}\n"
        f"What They Can Provide: {_join_field('what_they_can_provide')}\n"
        f"Legal Basis Typically Cited: {_join_field('legal_basis_typically_cited')}\n"
        f"Request Format Expected: {_normalize_text(payload.get('request_format_expected')) or 'None'}\n"
        f"Typical Response Time: {_normalize_text(payload.get('typical_response_time')) or 'None'}\n"
        f"Escalation Path If No Response: {_normalize_text(payload.get('escalation_path_if_no_response')) or 'None'}\n"
        f"Notes Or Caveats: {_normalize_text(payload.get('notes_or_caveats')) or 'None'}\n"
        f"Context Type: {context_type}\n"
    )


def _sop_prompt_block(payload: dict[str, Any], *, context_type: str) -> str:
    lines = [
        "SOP:",
        f"Section ID: {payload.get('act', '')}_{_identifier_value(payload, 'sop')}",
        f"Act: {_normalize_text(payload.get('act')) or 'None'}",
        f"Crime Type: {_normalize_text(payload.get('crime_type')) or 'None'}",
        f"Title: {_normalize_text(payload.get('title')) or 'None'}",
        f"Source: {_normalize_text(payload.get('source')) or 'None'}",
        "Steps:",
    ]
    for step in payload.get("steps", []) or []:
        if not isinstance(step, dict):
            continue
        lines.extend(
            [
                f"- Step {_normalize_text(step.get('order')) or _normalize_text(step.get('step_id'))}: {_normalize_text(step.get('title')) or 'None'}",
                f"  Description: {_normalize_text(step.get('description')) or 'None'}",
                f"  Required Evidence: {_normalize_csv(step.get('required_evidence')) or 'None'}",
                f"  Legal Basis: {_normalize_text(step.get('legal_basis')) or 'None'}",
                f"  Department Entity ID: {_normalize_text(step.get('department_entity_id')) or 'None'}",
                f"  Condition To Start: {_normalize_text(step.get('condition_to_start')) or 'None'}",
                f"  Condition To Complete: {_normalize_text(step.get('condition_to_complete')) or 'None'}",
                f"  If Blocked: {_normalize_csv(step.get('if_blocked')) or 'None'}",
            ]
        )
    lines.append("Dead End Strategies:")
    for strategy in payload.get("dead_end_strategies", []) or []:
        if not isinstance(strategy, dict):
            continue
        lines.extend(
            [
                f"- Condition: {_normalize_text(strategy.get('condition')) or 'None'}",
                f"  Suggested Actions: {_normalize_csv(strategy.get('suggested_actions')) or 'None'}",
            ]
        )
    lines.append(f"Context Type: {context_type}")
    return "\n".join(lines)


class CrimeOSModel(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)


class DocumentMetadata(CrimeOSModel):
    source_path: str = ""
    source_filename: str = ""
    parser_name: str = ""
    parser_version: str = "1.0"
    source_pages: list[int] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=_utc_now)
    extra: dict[str, Any] = Field(default_factory=dict)


class ClauseRecord(CrimeOSModel):
    id: str = ""
    content: str = ""
    references: list[str] = Field(default_factory=list)
    page: int = 0
    source_page: int = 0
    source_pages: list[int] = Field(default_factory=list)


class SubsectionRecord(CrimeOSModel):
    id: str = ""
    content: str = ""
    references: list[str] = Field(default_factory=list)
    page: int = 0
    source_page: int = 0
    source_pages: list[int] = Field(default_factory=list)
    clauses: list[ClauseRecord] = Field(default_factory=list)


class LegalSectionRecord(CrimeOSModel):
    id: str = ""
    document_type: str = "legal_act"
    act: str = ""
    serial_number: str = ""
    chapter: str = ""
    chapter_tag: list[str] = Field(default_factory=list)
    content: str = ""
    summary: str = ""
    references: list[str] = Field(default_factory=list)
    page_numbers: list[int] = Field(default_factory=list)
    metadata: DocumentMetadata = Field(default_factory=DocumentMetadata)


class DeptRegistryRecord(CrimeOSModel):
    act: str = ""
    entity_id: str = ""
    entity_name: str = ""
    category: str = ""
    what_they_can_provide: list[str] = Field(default_factory=list)
    legal_basis_typically_cited: list[str] = Field(default_factory=list)
    request_format_expected: str = ""
    typical_response_time: str = ""
    escalation_path_if_no_response: str = ""
    notes_or_caveats: str = ""
    confidence: str = ""


class StepRecord(CrimeOSModel):
    step_id: str = ""
    order: int = 0
    title: str = ""
    description: str = ""
    required_evidence: list[str] = Field(default_factory=list)
    legal_basis: str | None = None
    department_entity_id: str = ""
    condition_to_start: str = ""
    condition_to_complete: str = ""
    on_complete_trigger: list[str] = Field(default_factory=list)
    if_blocked: list[str] = Field(default_factory=list)


class DeadEndStrategyRecord(CrimeOSModel):
    condition: str = ""
    suggested_actions: list[str] = Field(default_factory=list)


class SOPRecord(CrimeOSModel):
    act: str = ""
    sop_id: str = ""
    crime_type: str = ""
    title: str = ""
    source: str = ""
    steps: list[StepRecord] = Field(default_factory=list)
    dead_end_strategies: list[DeadEndStrategyRecord] = Field(default_factory=list)


@dataclass(slots=True)
class EmbeddedDocumentRecord:
    record: ParsedDocument
    embedding_text: str
    embedding: list[float] = field(default_factory=list)
    uuid: str = field(default_factory=lambda: str(uuid4()))

    def to_payload(self) -> dict[str, Any]:
        return _to_payload(self.record)

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "record": _to_payload(self.record),
            "embedding_text": self.embedding_text,
            "embedding": self.embedding,
            "uuid": self.uuid,
        }


EmbeddedLegalRecord = EmbeddedDocumentRecord
EmbeddedDeptRecord = EmbeddedDocumentRecord
EmbeddedSOPRecord = EmbeddedDocumentRecord


@dataclass(slots=True)
class RetrievedDocumentRecord:
    payload: dict[str, Any]
    schema_name: str = "generic"

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "RetrievedDocumentRecord":
        return cls(payload=dict(payload), schema_name=_infer_schema_name(payload))

    @classmethod
    def from_record(cls, record: Any) -> "RetrievedDocumentRecord":
        return cls.from_payload(_to_payload(record))

    @property
    def act(self) -> str:
        return str(self.payload.get("act") or "").strip()

    @property
    def identifier(self) -> str:
        return _identifier_value(self.payload, self.schema_name)

    @property
    def serial_number(self) -> str:
        return self.identifier

    @property
    def chapter(self) -> str:
        return str(self.payload.get("chapter") or "").strip()

    @property
    def chapter_tag(self) -> list[str]:
        value = self.payload.get("chapter_tag")
        if isinstance(value, list):
            return [str(item) for item in value if str(item).strip()]
        if value is None:
            return []
        return [str(value)]

    @property
    def summary(self) -> str:
        return str(self.payload.get("summary") or "").strip()

    @property
    def content(self) -> str:
        return str(self.payload.get("content") or "").strip()

    @property
    def references(self) -> list[str]:
        value = self.payload.get("references")
        if isinstance(value, list):
            return [str(item) for item in value if str(item).strip()]
        return []

    @property
    def page_numbers(self) -> list[int]:
        value = self.payload.get("page_numbers")
        if isinstance(value, list):
            pages: list[int] = []
            for item in value:
                try:
                    pages.append(int(item))
                except Exception:
                    continue
            return pages
        return []

    @property
    def title(self) -> str:
        if self.schema_name == "dept_registry":
            return str(self.payload.get("entity_name") or "").strip()
        if self.schema_name == "sop":
            return str(self.payload.get("title") or "").strip()
        return str(self.payload.get("serial_number") or "").strip()

    @property
    def crime_type(self) -> str:
        return str(self.payload.get("crime_type") or "").strip()

    @property
    def entity_name(self) -> str:
        return str(self.payload.get("entity_name") or "").strip()

    @property
    def section_key(self) -> str:
        act = self.act
        identifier = self.identifier
        if act and identifier:
            return f"{act}_{identifier}"
        return identifier or act

    @property
    def display_title(self) -> str:
        if self.schema_name == "legal":
            return f"Section {self.identifier}".strip()
        if self.schema_name == "dept_registry":
            return self.entity_name or self.identifier
        if self.schema_name == "sop":
            return self.title or self.identifier
        return self.section_key

    def bm25_text(self) -> str:
        if self.schema_name == "dept_registry":
            return _dept_bm25_text(self.payload)
        if self.schema_name == "sop":
            return _sop_bm25_text(self.payload)
        return _legal_bm25_text(self.payload)

    def prompt_block(self, *, context_type: str = "retrieved_section") -> str:
        if self.schema_name == "dept_registry":
            return _dept_prompt_block(self.payload, context_type=context_type)
        if self.schema_name == "sop":
            return _sop_prompt_block(self.payload, context_type=context_type)
        return _legal_prompt_block(self.payload, context_type=context_type)


@dataclass(slots=True)
class LegalRetrievalResult:
    record: RetrievedDocumentRecord
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
    def chapter(self) -> str:
        return self.record.chapter

    @property
    def references(self) -> list[str]:
        return self.record.references

    @property
    def section_key(self) -> str:
        return self.record.section_key

    @property
    def schema_name(self) -> str:
        return self.record.schema_name

    @property
    def content(self) -> str:
        return self.record.content

    def to_section_block(self) -> str:
        return self.record.prompt_block(context_type=self.context_type)


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
