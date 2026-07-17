from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

from ingestion.schemas import LegalSectionRecord, DeptRegistryRecord, SOPRecord

from .models import EmbeddedLegalRecord, EmbeddedDeptRecord, EmbeddedSOPRecord


def _normalize_chapter_tags(value: Any) -> str:
    if isinstance(value, (list, tuple)):
        return ", ".join(str(item) for item in value if str(item).strip())
    if value is None:
        return ""
    return str(value)


def build_legal_embedding_text(record: LegalSectionRecord) -> str:
    return (
        f"ACT:\n{record.act}\n\n"
        f"CHAPTER:\n{record.chapter or ''}\n\n"
        f"CHAPTER TAGS:\n{_normalize_chapter_tags(record.chapter_tag)}\n\n"
        f"SECTION:\n{record.serial_number}\n\n"
        f"CONTENT:\n{record.content}"
    ).strip()

def build_deptRegistry_embedding_text(record: DeptRegistryRecord) -> str:
    return (
        f"ACT:\n{record.act}\n\n"
        f"ENTITY ID:\n{record.entity_id}\n\n"
        f"ENTITY NAME:\n{record.entity_name}\n\n"
        f"CATEGORY:\n{record.category}\n\n"
        f"WHAT THEY CAN PROVIDE:\n"
        f"{chr(10).join(record.what_they_can_provide)}\n\n"
        f"LEGAL BASIS:\n"
        f"{chr(10).join(record.legal_basis_typically_cited)}\n\n"
        f"REQUEST FORMAT:\n{record.request_format_expected}\n\n"
        f"TYPICAL RESPONSE TIME:\n{record.typical_response_time}\n\n"
        f"ESCALATION PATH:\n{record.escalation_path_if_no_response}\n\n"
        f"NOTES:\n{record.notes_or_caveats}"
    ).strip()

def build_sop_embedding_text(record: SOPRecord) -> str:
    steps_text = []

    for step in sorted(record.steps, key=lambda s: s.order):
        steps_text.append(
            f"""
STEP {step.order}: {step.title}

DESCRIPTION:
{step.description}

LEGAL BASIS:
{step.legal_basis or ''}

DEPARTMENT:
{step.department_entity_id}

REQUIRED EVIDENCE:
{', '.join(step.required_evidence)}

START CONDITION:
{step.condition_to_start}

COMPLETE CONDITION:
{step.condition_to_complete}

ON COMPLETE:
{', '.join(step.on_complete_trigger)}

IF BLOCKED:
{', '.join(step.if_blocked)}
""".strip()
        )

    dead_end_text = []

    for strategy in record.dead_end_strategies:
        dead_end_text.append(
            f"""
CONDITION:
{strategy.condition}

SUGGESTED ACTIONS:
{', '.join(strategy.suggested_actions)}
""".strip()
        )

    return (
        f"ACT:\n{record.act}\n\n"
        f"SOP ID:\n{record.sop_id}\n\n"
        f"CRIME TYPE:\n{record.crime_type}\n\n"
        f"TITLE:\n{record.title}\n\n"
        f"SOURCE:\n{record.source}\n\n"
        f"STEPS:\n\n"
        f"{'\n\n'.join(steps_text)}\n\n"
        f"DEAD END STRATEGIES:\n\n"
        f"{'\n\n'.join(dead_end_text)}"
    ).strip()


# def _coerce_clause(data: Any) -> ClauseRecord:
#     return ClauseRecord.model_validate(data)


# def _coerce_subsection(data: Any) -> SubsectionRecord:
#     if isinstance(data, dict) and "clauses" in data:
#         data = dict(data)
#         data["clauses"] = [_coerce_clause(item) for item in data.get("clauses", [])]
#     return SubsectionRecord.model_validate(data)


def _coerce_record(data: Any) -> LegalSectionRecord:
    if isinstance(data, dict):
        data = dict(data)
        # if "clauses" in data:
        #     data["clauses"] = [_coerce_clause(item) for item in data.get("clauses", [])]
        # if "subsections" in data:
        #     data["subsections"] = [_coerce_subsection(item) for item in data.get("subsections", [])]
    return LegalSectionRecord.model_validate(data)


def load_legal_records(path: str | Path) -> list[LegalSectionRecord]:
    source = Path(path)
    if source.is_dir():
        files = sorted(p for p in source.glob("*.json") if p.is_file())
    else:
        files = [source]

    records: list[LegalSectionRecord] = []
    for file_path in files:
        data = json.loads(file_path.read_text(encoding="utf-8"))
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict) and "records" in data:
            items = data["records"]
        else:
            items = [data]
        for item in items:
            records.append(_coerce_record(item))
    return records

def _coerce_record(data: Any) -> DeptRegistryRecord:
    if isinstance(data, dict):
        data = dict(data)
        # if "clauses" in data:
        #     data["clauses"] = [_coerce_clause(item) for item in data.get("clauses", [])]
        # if "subsections" in data:
        #     data["subsections"] = [_coerce_subsection(item) for item in data.get("subsections", [])]
    return DeptRegistryRecord.model_validate(data)


def load_dept_records(path: str | Path) -> list[DeptRegistryRecord]:
    source = Path(path)
    if source.is_dir():
        files = sorted(p for p in source.glob("*.json") if p.is_file())
    else:
        files = [source]

    records: list[DeptRegistryRecord] = []
    for file_path in files:
        data = json.loads(file_path.read_text(encoding="utf-8"))
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict) and "records" in data:
            items = data["records"]
        else:
            items = [data]
        for item in items:
            records.append(_coerce_record(item))
    return records

def _coerce_record(data: Any) -> SOPRecord:
    if isinstance(data, dict):
        data = dict(data)
        # if "clauses" in data:
        #     data["clauses"] = [_coerce_clause(item) for item in data.get("clauses", [])]
        # if "subsections" in data:
        #     data["subsections"] = [_coerce_subsection(item) for item in data.get("subsections", [])]
    return SOPRecord.model_validate(data)


def load_sop_records(path: str | Path) -> list[SOPRecord]:
    source = Path(path)
    if source.is_dir():
        files = sorted(p for p in source.glob("*.json") if p.is_file())
    else:
        files = [source]

    records: list[SOPRecord] = []
    for file_path in files:
        data = json.loads(file_path.read_text(encoding="utf-8"))
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict) and "records" in data:
            items = data["records"]
        else:
            items = [data]
        for item in items:
            records.append(_coerce_record(item))
    return records


@dataclass(slots=True)
class BGEEmbeddingConfig:
    model_name: str = "BAAI/bge-m3"
    device: str | None = None
    batch_size: int = 16
    normalize_embeddings: bool = True


class BGEEmbedder:
    def __init__(self, config: BGEEmbeddingConfig | None = None) -> None:
        self.config = config or BGEEmbeddingConfig()
        self._model = None

    def _load_model(self):
        if self._model is not None:
            return self._model
        try:
            from sentence_transformers import SentenceTransformer
        except Exception as exc:  # pragma: no cover - dependency missing
            raise RuntimeError(
                "sentence-transformers is required for embedding. Install project dependencies first."
            ) from exc
        self._model = SentenceTransformer(self.config.model_name, device=self.config.device)
        return self._model

    def embedding_dimension(self) -> int:
        model = self._load_model()
        return int(model.get_sentence_embedding_dimension())

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        model = self._load_model()
        embeddings = model.encode(
            list(texts),
            batch_size=self.config.batch_size,
            normalize_embeddings=self.config.normalize_embeddings,
            show_progress_bar=False,
        )
        if hasattr(embeddings, "tolist"):
            return embeddings.tolist()
        return [list(vector) for vector in embeddings]

    # def embed_record(self, record: LegalSectionRecord) -> EmbeddedLegalRecord:
    #     # embedding_text = build_legal_embedding_text(record)
    #     embedding_text = build_deptRegistry_embedding_text(record)        
    #     embedding = self.embed_texts([embedding_text])[0]
    #     return EmbeddedLegalRecord(record=record, embedding_text=embedding_text, embedding=embedding)

    def embed_records_legal(self, records: Iterable[LegalSectionRecord]) -> list[EmbeddedLegalRecord]:
        materialized = list(records)
        # texts = [build_legal_embedding_text(record) for record in materialized]
        texts = [build_legal_embedding_text(record) for record in materialized]
        vectors = self.embed_texts(texts) if materialized else []
        return [
            EmbeddedLegalRecord(record=record, embedding_text=text, embedding=vector)
            for record, text, vector in zip(materialized, texts, vectors, strict=False)
        ]
    
    def embed_records_dept(self, records: Iterable[DeptRegistryRecord]) -> list[EmbeddedLegalRecord]:
        materialized = list(records)
        # texts = [build_legal_embedding_text(record) for record in materialized]
        texts = [build_deptRegistry_embedding_text(record) for record in materialized]
        vectors = self.embed_texts(texts) if materialized else []
        return [
            EmbeddedLegalRecord(record=record, embedding_text=text, embedding=vector)
            for record, text, vector in zip(materialized, texts, vectors, strict=False)
        ]

    def embed_records_sop(self, records: Iterable[SOPRecord]) -> list[EmbeddedLegalRecord]:
        materialized = list(records)
        # texts = [build_legal_embedding_text(record) for record in materialized]
        texts = [build_sop_embedding_text(record) for record in materialized]
        vectors = self.embed_texts(texts) if materialized else []
        return [
            EmbeddedLegalRecord(record=record, embedding_text=text, embedding=vector)
            for record, text, vector in zip(materialized, texts, vectors, strict=False)
        ]



def save_embedded_records(records: Iterable[EmbeddedLegalRecord], path: str | Path) -> Path:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record.to_json_dict(), ensure_ascii=False))
            handle.write("\n")
    return output_path
