from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

from ingestion.schemas import DeptRegistryRecord, LegalSectionRecord, SOPRecord

from .models import EmbeddedDocumentRecord

ParsedRecord = LegalSectionRecord | DeptRegistryRecord | SOPRecord

# ─── Load .env ────────────────────────────────────────────────────────────────
def _load_dotenv() -> None:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    with env_path.open() as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip()
            if key and key not in os.environ:
                os.environ[key] = value

_load_dotenv()

# ─── Config ───────────────────────────────────────────────────────────────────
# llama.cpp server running nomic-embed-text-v2-moe.Q4_K_M at port 8003.
# All three values are read from environment / .env so they can be changed
# without touching code.
LLAMA_CPP_URL    = os.environ.get("LEGAL_AGENT_LLAMA_CPP_URL",    "http://127.0.0.1:8003")
EMBEDDING_MODEL  = os.environ.get("LEGAL_AGENT_EMBEDDING_MODEL",  "nomic-embed-text-v2-moe")
EMBEDDING_DIM    = int(os.environ.get("LEGAL_AGENT_EMBEDDING_DIM", "768"))
EMBEDDING_TIMEOUT = 60  # seconds

# nomic asymmetric prefixes
DOCUMENT_PREFIX = "search_document: "
QUERY_PREFIX = "search_query: "


# ─── Text helpers (unchanged) ─────────────────────────────────────────────────

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
    return [r for r in load_parsed_records(path, record_type="legal") if isinstance(r, LegalSectionRecord)]


def load_dept_records(path: str | Path) -> list[DeptRegistryRecord]:
    return [r for r in load_parsed_records(path, record_type="dept") if isinstance(r, DeptRegistryRecord)]


def load_sop_records(path: str | Path) -> list[SOPRecord]:
    return [r for r in load_parsed_records(path, record_type="sop") if isinstance(r, SOPRecord)]


# ─── Embedding text builders (unchanged) ─────────────────────────────────────

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
        parts.extend([
            f"STEP TITLE:\n{step.title}",
            f"STEP DESCRIPTION:\n{step.description}",
            f"REQUIRED EVIDENCE:\n{_normalize_csv(step.required_evidence)}",
            f"LEGAL BASIS:\n{step.legal_basis or ''}",
            f"DEPARTMENT ENTITY ID:\n{step.department_entity_id}",
            f"CONDITION TO START:\n{step.condition_to_start}",
            f"CONDITION TO COMPLETE:\n{step.condition_to_complete}",
            f"IF BLOCKED:\n{_normalize_csv(step.if_blocked)}",
        ])
    for strategy in record.dead_end_strategies:
        parts.extend([
            f"DEAD END CONDITION:\n{strategy.condition}",
            f"SUGGESTED ACTIONS:\n{_normalize_csv(strategy.suggested_actions)}",
        ])
    return "\n\n".join(part for part in parts if part).strip()


def build_embedding_text(record: ParsedRecord) -> str:
    if isinstance(record, DeptRegistryRecord):
        return build_dept_embedding_text(record)
    if isinstance(record, SOPRecord):
        return build_sop_embedding_text(record)
    return build_legal_embedding_text(record)


# ─── NomicEmbedder — replaces BGEEmbedder ─────────────────────────────────────
# Uses llama.cpp server running nomic-embed-text-v2-moe.Q4_K_M at port 8003.
# Synchronous httpx client — same interface as BGEEmbedder so retrieval.py
# requires zero changes (it calls embed_texts / embed_records / embed_record).

class NomicEmbedder:
    """
    Synchronous embedder backed by llama-server (nomic-embed-text-v2-moe.Q4_K_M).
    Exposes the same public interface as the old BGEEmbedder so all callers
    (retrieval.py, embed_records.py) work without modification.

    Accepts an optional BGEEmbeddingConfig as first arg for drop-in compatibility
    with old call sites — the config fields are ignored; URL/model come from env.
    """

    def __init__(
        self,
        config_or_url: "BGEEmbeddingConfig | str | None" = None,
        model: str = EMBEDDING_MODEL,
        timeout: int = EMBEDDING_TIMEOUT,
    ) -> None:
        import httpx
        # Accept either a legacy BGEEmbeddingConfig object (ignored) or a URL string
        if isinstance(config_or_url, str):
            llama_cpp_url = config_or_url
        else:
            # BGEEmbeddingConfig passed — ignore it, use env value
            llama_cpp_url = LLAMA_CPP_URL
        self._url = llama_cpp_url.rstrip("/")
        self._model = model
        self._client = httpx.Client(
            base_url=self._url,
            timeout=timeout,
            headers={"Content-Type": "application/json"},
        )
        print(
            f"[NomicEmbedder] initialised — server: {self._url}, model: {self._model}",
            file=sys.stderr,
        )

    def embedding_dimension(self) -> int:
        return EMBEDDING_DIM

    def _embed_one(self, text: str, label: str = "doc") -> list[float]:
        """Call llama-server /v1/embeddings for a single text, returns vector."""
        import hashlib
        t0 = time.perf_counter()
        try:
            response = self._client.post(
                "/v1/embeddings",
                json={"model": self._model, "input": text},
            )
            response.raise_for_status()
            vector: list[float] = response.json()["data"][0]["embedding"]
            elapsed = round((time.perf_counter() - t0) * 1000, 2)
            print(
                f"[timing] nomic_embed ({label}): {elapsed}ms dim={len(vector)}",
                file=sys.stderr,
            )
            return vector
        except Exception as exc:
            # Deterministic mock fallback so offline dev still works
            print(
                f"[NomicEmbedder] WARNING: embedding call failed ({exc}). "
                f"Using mock vector of dim {EMBEDDING_DIM}.",
                file=sys.stderr,
            )
            seed = hashlib.sha256(text.encode()).digest()
            return [(seed[i % len(seed)] / 255.0) * 2.0 - 1.0 for i in range(EMBEDDING_DIM)]

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        """Embed a list of texts. Uses document prefix for all (indexing context)."""
        t0 = time.perf_counter()
        result = [self._embed_one(DOCUMENT_PREFIX + t, label="doc") for t in texts]
        elapsed = time.perf_counter() - t0
        print(f"[timing] embed_texts: {elapsed:.3f}s for {len(texts)} text(s)", file=sys.stderr)
        return result

    def embed_query(self, query: str) -> list[float]:
        """Embed a query string with the query prefix for retrieval."""
        return self._embed_one(QUERY_PREFIX + query, label="query")

    def embed_record(self, record: ParsedRecord) -> EmbeddedDocumentRecord:
        t0 = time.perf_counter()
        embedding_text = build_embedding_text(record)
        embedding = self._embed_one(DOCUMENT_PREFIX + embedding_text, label="record")
        elapsed = time.perf_counter() - t0
        print(f"[timing] embed_record: {elapsed:.3f}s for {type(record).__name__}", file=sys.stderr)
        return EmbeddedDocumentRecord(record=record, embedding_text=embedding_text, embedding=embedding)

    def embed_records(self, records: Iterable[ParsedRecord]) -> list[EmbeddedDocumentRecord]:
        materialized = list(records)
        t0 = time.perf_counter()
        embedded = [self.embed_record(r) for r in materialized]
        elapsed = time.perf_counter() - t0
        print(f"[timing] embed_records: {elapsed:.3f}s for {len(materialized)} record(s)", file=sys.stderr)
        return embedded

    def close(self) -> None:
        self._client.close()


# ─── Alias — keeps __init__.py and any future code using BGEEmbedder working ──
# Old class is commented out below; NomicEmbedder is the active implementation.
BGEEmbedder = NomicEmbedder

# Old config dataclass kept for import compatibility (embed_records.py CLI uses it)
@dataclass(slots=True)
class BGEEmbeddingConfig:
    model_name: str = EMBEDDING_MODEL   # ignored — model is set via env/init
    device: str | None = None           # ignored — llama-server handles device
    batch_size: int = 16                # ignored — requests are one-at-a-time
    normalize_embeddings: bool = True   # ignored — llama-server normalises


# ─── OLD BGEEmbedder (sentence-transformers, in-process) — COMMENTED OUT ──────
# class BGEEmbedder:
#     def __init__(self, config: BGEEmbeddingConfig | None = None) -> None:
#         self.config = config or BGEEmbeddingConfig()
#         self._model = None
#
#     def _load_model(self):
#         if self._model is not None:
#             return self._model
#         try:
#             from sentence_transformers import SentenceTransformer
#         except Exception as exc:
#             raise RuntimeError(
#                 "sentence-transformers is required for embedding."
#             ) from exc
#         self._model = SentenceTransformer(self.config.model_name, device=self.config.device)
#         return self._model
#
#     def embedding_dimension(self) -> int:
#         model = self._load_model()
#         return int(model.get_sentence_embedding_dimension())
#
#     def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
#         model = self._load_model()
#         start = time.perf_counter()
#         embeddings = model.encode(
#             list(texts),
#             batch_size=self.config.batch_size,
#             normalize_embeddings=self.config.normalize_embeddings,
#             show_progress_bar=False,
#         )
#         elapsed = time.perf_counter() - start
#         print(f"[timing] embed_texts: {elapsed:.3f}s for {len(texts)} text(s)", file=sys.stderr)
#         if hasattr(embeddings, "tolist"):
#             return embeddings.tolist()
#         return [list(vector) for vector in embeddings]
#
#     def embed_record(self, record: ParsedRecord) -> EmbeddedDocumentRecord:
#         start = time.perf_counter()
#         embedding_text = build_embedding_text(record)
#         embedding = self.embed_texts([embedding_text])[0]
#         elapsed = time.perf_counter() - start
#         print(f"[timing] embed_record: {elapsed:.3f}s for {type(record).__name__}", file=sys.stderr)
#         return EmbeddedDocumentRecord(record=record, embedding_text=embedding_text, embedding=embedding)
#
#     def embed_records(self, records: Iterable[ParsedRecord]) -> list[EmbeddedDocumentRecord]:
#         materialized = list(records)
#         start = time.perf_counter()
#         texts = [build_embedding_text(record) for record in materialized]
#         vectors = self.embed_texts(texts) if materialized else []
#         elapsed = time.perf_counter() - start
#         print(f"[timing] embed_records: {elapsed:.3f}s for {len(materialized)} record(s)", file=sys.stderr)
#         return [
#             EmbeddedDocumentRecord(record=record, embedding_text=text, embedding=vector)
#             for record, text, vector in zip(materialized, texts, vectors, strict=False)
#         ]
# ─── END OLD BGEEmbedder ───────────────────────────────────────────────────────


def save_embedded_records(records: Iterable[EmbeddedDocumentRecord], path: str | Path) -> Path:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record.to_json_dict(), ensure_ascii=False))
            handle.write("\n")
    return output_path
