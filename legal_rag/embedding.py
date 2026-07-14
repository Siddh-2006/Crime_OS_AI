from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

from ingestion.schemas import ClauseRecord, LegalSectionRecord, SubsectionRecord

from .models import EmbeddedLegalRecord


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
        f"SECTION:\n{record.serial_number}\n\n"
        f"CONTENT:\n{record.content}"
    ).strip()


def _coerce_clause(data: Any) -> ClauseRecord:
    return ClauseRecord.model_validate(data)


def _coerce_subsection(data: Any) -> SubsectionRecord:
    if isinstance(data, dict) and "clauses" in data:
        data = dict(data)
        data["clauses"] = [_coerce_clause(item) for item in data.get("clauses", [])]
    return SubsectionRecord.model_validate(data)


def _coerce_record(data: Any) -> LegalSectionRecord:
    if isinstance(data, dict):
        data = dict(data)
        if "clauses" in data:
            data["clauses"] = [_coerce_clause(item) for item in data.get("clauses", [])]
        if "subsections" in data:
            data["subsections"] = [_coerce_subsection(item) for item in data.get("subsections", [])]
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

    def embed_record(self, record: LegalSectionRecord) -> EmbeddedLegalRecord:
        embedding_text = build_legal_embedding_text(record)
        embedding = self.embed_texts([embedding_text])[0]
        return EmbeddedLegalRecord(record=record, embedding_text=embedding_text, embedding=embedding)

    def embed_records(self, records: Iterable[LegalSectionRecord]) -> list[EmbeddedLegalRecord]:
        materialized = list(records)
        texts = [build_legal_embedding_text(record) for record in materialized]
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
