from __future__ import annotations

import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

from ingestion.schemas import DeptRegistryRecord, LegalSectionRecord, SOPRecord

from .models import EmbeddedDocumentRecord

ParsedRecord = LegalSectionRecord | DeptRegistryRecord | SOPRecord


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


def _infer_record_kind(data: dict[str, Any]) -> str:
    if "serial_number" in data or "chapter_tag" in data:
        return "legal"
    if "entity_name" in data and "what_they_can_provide" in data:
        return "dept"
    if "sop_id" in data or "crime_type" in data or "steps" in data:
        return "sop"
    return "legal"


def _coerce_record(data: Any, record_type: str = "auto") -> ParsedRecord:
    if hasattr(data, "model_dump"):
        data = data.model_dump(exclude_none=True, mode="json")
    elif isinstance(data, tuple):
        data = dict(data)
    if not isinstance(data, dict):
        raise TypeError(f"Unsupported record payload: {type(data)!r}")

    kind = record_type if record_type != "auto" else _infer_record_kind(data)
    if kind == "dept":
        return DeptRegistryRecord.model_validate(data)
    if kind == "sop":
        if isinstance(data, dict):
            data = dict(data)
            steps = data.get("steps", [])
            if isinstance(steps, list):
                normalized_steps = []
                for step in steps:
                    if not isinstance(step, dict):
                        normalized_steps.append(step)
                        continue
                    step = dict(step)
                    for key in ("required_evidence", "on_complete_trigger", "if_blocked"):
                        value = step.get(key)
                        if value in ("", None):
                            step[key] = []
                        elif isinstance(value, str):
                            step[key] = [value]
                    normalized_steps.append(step)
                data["steps"] = normalized_steps
        return SOPRecord.model_validate(data)
    return LegalSectionRecord.model_validate(data)


def load_parsed_records(path: str | Path, *, record_type: str = "auto") -> list[ParsedRecord]:
    source = Path(path)
    files = sorted(p for p in source.glob("*.json") if p.is_file()) if source.is_dir() else [source]

    records: list[ParsedRecord] = []
    for file_path in files:
        data = json.loads(file_path.read_text(encoding="utf-8"))
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict) and "records" in data:
            items = data["records"]
        else:
            items = [data]
        for item in items:
            records.append(_coerce_record(item, record_type=record_type))
    return records


def load_legal_records(path: str | Path) -> list[LegalSectionRecord]:
    return [record for record in load_parsed_records(path, record_type="legal") if isinstance(record, LegalSectionRecord)]


def load_dept_records(path: str | Path) -> list[DeptRegistryRecord]:
    return [record for record in load_parsed_records(path, record_type="dept") if isinstance(record, DeptRegistryRecord)]


def load_sop_records(path: str | Path) -> list[SOPRecord]:
    return [record for record in load_parsed_records(path, record_type="sop") if isinstance(record, SOPRecord)]


def build_legal_embedding_text(record: LegalSectionRecord) -> str:
    return (
        f"ACT:\n{record.act}\n\n"
        f"CHAPTER:\n{record.chapter or ''}\n\n"
        f"SECTION:\n{record.serial_number}\n\n"
        f"CONTENT:\n{record.content}"
    ).strip()


def build_dept_embedding_text(record: DeptRegistryRecord) -> str:
    return (
        f"ACT:\n{record.act}\n\n"
        f"ENTITY NAME:\n{record.entity_name}\n\n"
        f"CATEGORY:\n{record.category}\n\n"
        f"WHAT THEY CAN PROVIDE:\n{_normalize_csv(record.what_they_can_provide)}\n\n"
        f"LEGAL BASIS TYPICALLY CITED:\n{_normalize_csv(record.legal_basis_typically_cited)}\n\n"
        f"REQUEST FORMAT EXPECTED:\n{record.request_format_expected}\n\n"
        f"TYPICAL RESPONSE TIME:\n{record.typical_response_time}\n\n"
        f"ESCALATION PATH IF NO RESPONSE:\n{record.escalation_path_if_no_response}\n\n"
        f"NOTES OR CAVEATS:\n{record.notes_or_caveats}"
    ).strip()


def build_sop_embedding_text(record: SOPRecord) -> str:
    parts = [
        f"ACT:\n{record.act}",
        f"CRIME TYPE:\n{record.crime_type}",
        f"TITLE:\n{record.title}",
    ]

    for step in sorted(record.steps, key=lambda item: item.order):
        parts.extend(
            [
                f"STEP TITLE:\n{step.title}",
                f"STEP DESCRIPTION:\n{step.description}",
                f"REQUIRED EVIDENCE:\n{_normalize_csv(step.required_evidence)}",
                f"LEGAL BASIS:\n{step.legal_basis or ''}",
                f"DEPARTMENT ENTITY ID:\n{step.department_entity_id}",
                f"CONDITION TO START:\n{step.condition_to_start}",
                f"CONDITION TO COMPLETE:\n{step.condition_to_complete}",
                f"IF BLOCKED:\n{_normalize_csv(step.if_blocked)}",
            ]
        )

    for strategy in record.dead_end_strategies:
        parts.extend(
            [
                f"DEAD END CONDITION:\n{strategy.condition}",
                f"SUGGESTED ACTIONS:\n{_normalize_csv(strategy.suggested_actions)}",
            ]
        )

    return "\n\n".join(part for part in parts if part).strip()


def build_embedding_text(record: ParsedRecord) -> str:
    if isinstance(record, DeptRegistryRecord):
        return build_dept_embedding_text(record)
    if isinstance(record, SOPRecord):
        return build_sop_embedding_text(record)
    return build_legal_embedding_text(record)


@dataclass(slots=True)
class BGEEmbeddingConfig:
    model_name: str = "BAAI/bge-large-en-v1.5"
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
        start = time.perf_counter()
        embeddings = model.encode(
            list(texts),
            batch_size=self.config.batch_size,
            normalize_embeddings=self.config.normalize_embeddings,
            show_progress_bar=False,
        )
        elapsed = time.perf_counter() - start
        print(f"[timing] embed_texts: {elapsed:.3f}s for {len(texts)} text(s)", file=sys.stderr)
        if hasattr(embeddings, "tolist"):
            return embeddings.tolist()
        return [list(vector) for vector in embeddings]

    def embed_record(self, record: ParsedRecord) -> EmbeddedDocumentRecord:
        start = time.perf_counter()
        embedding_text = build_embedding_text(record)
        embedding = self.embed_texts([embedding_text])[0]
        elapsed = time.perf_counter() - start
        print(f"[timing] embed_record: {elapsed:.3f}s for {type(record).__name__}", file=sys.stderr)
        return EmbeddedDocumentRecord(record=record, embedding_text=embedding_text, embedding=embedding)

    def embed_records(self, records: Iterable[ParsedRecord]) -> list[EmbeddedDocumentRecord]:
        materialized = list(records)
        start = time.perf_counter()
        texts = [build_embedding_text(record) for record in materialized]
        vectors = self.embed_texts(texts) if materialized else []
        elapsed = time.perf_counter() - start
        print(f"[timing] embed_records: {elapsed:.3f}s for {len(materialized)} record(s)", file=sys.stderr)
        return [
            EmbeddedDocumentRecord(record=record, embedding_text=text, embedding=vector)
            for record, text, vector in zip(materialized, texts, vectors, strict=False)
        ]


def save_embedded_records(records: Iterable[EmbeddedDocumentRecord], path: str | Path) -> Path:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record.to_json_dict(), ensure_ascii=False))
            handle.write("\n")
    return output_path
