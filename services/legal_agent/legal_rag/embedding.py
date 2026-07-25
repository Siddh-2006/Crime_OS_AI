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

# ─── Nomic / llama.cpp config (fallback) ──────────────────────────────────────
LLAMA_CPP_URL     = os.environ.get("LEGAL_AGENT_LLAMA_CPP_URL",   "http://127.0.0.1:8003")
NOMIC_MODEL       = os.environ.get("LEGAL_AGENT_EMBEDDING_MODEL",  "nomic-embed-text-v2-moe")
NOMIC_DIM         = int(os.environ.get("LEGAL_AGENT_EMBEDDING_DIM", "768"))
EMBEDDING_TIMEOUT = 60  # seconds

# nomic asymmetric prefixes (not used by BGE — BGE is symmetric)
DOCUMENT_PREFIX = "search_document: "
QUERY_PREFIX    = "search_query: "


# ─── Text helpers ─────────────────────────────────────────────────────────────

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


# ─── Embedding text builders ──────────────────────────────────────────────────

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


# ─── BGEEmbeddingConfig ───────────────────────────────────────────────────────

@dataclass(slots=True)
class BGEEmbeddingConfig:
    """Configuration for BGEEmbedder. Ignored when falling back to NomicEmbedder."""
    model_name: str = "BAAI/bge-base-en-v1.5"
    device: str | None = None
    batch_size: int = 16
    normalize_embeddings: bool = True


# ─── NomicEmbedder (fallback — llama.cpp HTTP) ────────────────────────────────

class NomicEmbedder:
    """
    Synchronous embedder backed by llama-server (nomic-embed-text-v2-moe.Q4_K_M).
    Used as fallback when sentence-transformers / BGE is not available.

    Exposes the same interface as BGEEmbedder so callers need no changes.
    """

    def __init__(
        self,
        config_or_url: "BGEEmbeddingConfig | str | None" = None,
        model: str = NOMIC_MODEL,
        timeout: int = EMBEDDING_TIMEOUT,
    ) -> None:
        import httpx
        llama_cpp_url = config_or_url if isinstance(config_or_url, str) else LLAMA_CPP_URL
        self._url   = llama_cpp_url.rstrip("/")
        self._model = model
        self._client = httpx.Client(
            base_url=self._url,
            timeout=timeout,
            headers={"Content-Type": "application/json"},
        )
        print(
            f"[NomicEmbedder] Initialised — server: {self._url}, model: {self._model}",
            file=sys.stderr,
        )

    def embedding_dimension(self) -> int:
        return NOMIC_DIM

    def _embed_one(self, text: str, label: str = "doc") -> list[float]:
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
            print(f"[NomicEmbedder] Embedded ({label}) in {elapsed}ms  dim={len(vector)}", file=sys.stderr)
            return vector
        except Exception as exc:
            print(
                f"[NomicEmbedder] WARNING: embedding call failed ({exc}). "
                f"Using deterministic mock vector of dim {NOMIC_DIM}.",
                file=sys.stderr,
            )
            seed = hashlib.sha256(text.encode()).digest()
            return [(seed[i % len(seed)] / 255.0) * 2.0 - 1.0 for i in range(NOMIC_DIM)]

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        t0 = time.perf_counter()
        result = [self._embed_one(DOCUMENT_PREFIX + t, label="doc") for t in texts]
        print(f"[NomicEmbedder] embed_texts: {time.perf_counter() - t0:.3f}s for {len(texts)} text(s)", file=sys.stderr)
        return result

    def embed_query(self, query: str) -> list[float]:
        """Embed query-side text (uses search_query: prefix for nomic asymmetric model)."""
        return self._embed_one(QUERY_PREFIX + query, label="query")

    def embed_record(self, record: ParsedRecord) -> EmbeddedDocumentRecord:
        t0 = time.perf_counter()
        embedding_text = build_embedding_text(record)
        embedding = self._embed_one(DOCUMENT_PREFIX + embedding_text, label="record")
        print(f"[NomicEmbedder] embed_record: {time.perf_counter() - t0:.3f}s for {type(record).__name__}", file=sys.stderr)
        return EmbeddedDocumentRecord(record=record, embedding_text=embedding_text, embedding=embedding)

    def embed_records(self, records: Iterable[ParsedRecord]) -> list[EmbeddedDocumentRecord]:
        materialized = list(records)
        t0 = time.perf_counter()
        embedded = [self.embed_record(r) for r in materialized]
        print(f"[NomicEmbedder] embed_records: {time.perf_counter() - t0:.3f}s for {len(materialized)} record(s)", file=sys.stderr)
        return embedded

    def close(self) -> None:
        self._client.close()


# ─── Cache check helper ───────────────────────────────────────────────────────

def _is_model_cached(model_name: str) -> bool:
    """
    Check if a HuggingFace model is already downloaded in the local cache.
    Returns True only if a snapshot directory with actual files exists.
    Never triggers a network request.
    """
    try:
        # Standard HuggingFace cache location
        hf_home = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface"))
        hub_dir = hf_home / "hub"

        # Model repos are stored as "models--{org}--{name}"
        # e.g. BAAI/bge-base-en-v1.5 → models--BAAI--bge-base-en-v1.5
        safe_name = model_name.replace("/", "--")
        model_dir = hub_dir / f"models--{safe_name}"

        if not model_dir.exists():
            return False

        # Check that at least one snapshot directory has files
        snapshots_dir = model_dir / "snapshots"
        if not snapshots_dir.exists():
            return False

        for snapshot in snapshots_dir.iterdir():
            if snapshot.is_dir() and any(snapshot.iterdir()):
                return True

        return False
    except Exception:
        # If we can't determine cache state, assume not cached (safe default)
        return False


# ─── BGEEmbedder (primary — sentence-transformers in-process) ─────────────────
#
# Tries to load sentence-transformers on first use.
# If the library is not installed, logs a clear warning and transparently
# delegates every call to NomicEmbedder for the rest of the process lifetime.
#
# Priority:  BGE (sentence-transformers)  →  Nomic (llama.cpp HTTP fallback)
#
# Logs printed to stderr so they appear in the terminal alongside [timing] lines.

class BGEEmbedder:
    """
    Primary embedder using BAAI/bge-* via sentence-transformers (in-process).

    On first use, attempts to import sentence_transformers.SentenceTransformer.
    - If found   → uses BGE model directly (fast, local, no HTTP needed).
    - If missing → logs "[BGEEmbedder] sentence-transformers not found — falling
                   back to NomicEmbedder (llama.cpp)" and delegates all calls
                   to a NomicEmbedder instance for the rest of the process.

    Call sites are identical for both paths — no code changes needed upstream.
    """

    def __init__(self, config: BGEEmbeddingConfig | None = None) -> None:
        self.config = config or BGEEmbeddingConfig()
        self._model = None          # SentenceTransformer or None
        self._fallback: NomicEmbedder | None = None
        self._checked = False       # whether we already attempted to load

    # ── Private: resolve the backend on first call ────────────────────────────

    def _resolve(self) -> None:
        """Load BGE or set up Nomic fallback. Called once, on first embed request."""
        if self._checked:
            return
        self._checked = True

        print(
            f"[BGEEmbedder] Attempting to load sentence-transformers "
            f"with model '{self.config.model_name}'...",
            file=sys.stderr,
        )
        try:
            from sentence_transformers import SentenceTransformer  # type: ignore
        except ImportError:
            print(
                "[BGEEmbedder] sentence-transformers NOT found (ImportError). "
                "Falling back to NomicEmbedder (llama.cpp HTTP server).",
                file=sys.stderr,
            )
            self._fallback = NomicEmbedder()
            return
        except Exception as exc:
            print(
                f"[BGEEmbedder] sentence-transformers failed to import ({exc}). "
                "Falling back to NomicEmbedder (llama.cpp HTTP server).",
                file=sys.stderr,
            )
            self._fallback = NomicEmbedder()
            return

        # ── Check if the model is already cached locally ──────────────────────
        # We must NOT trigger a download. Check the HuggingFace cache directory
        # by probing the snapshot folder before calling SentenceTransformer().
        model_cached = _is_model_cached(self.config.model_name)
        if not model_cached:
            print(
                f"[BGEEmbedder] Model '{self.config.model_name}' is NOT present in local "
                "HuggingFace cache. Skipping download — falling back to NomicEmbedder "
                "(llama.cpp HTTP server). To use BGE, run: "
                f"python -c \"from sentence_transformers import SentenceTransformer; "
                f"SentenceTransformer('{self.config.model_name}')\"",
                file=sys.stderr,
            )
            self._fallback = NomicEmbedder()
            return

        # Model is cached — load it (no network call needed)
        try:
            t0 = time.perf_counter()
            self._model = SentenceTransformer(
                self.config.model_name,
                device=self.config.device,
                local_files_only=True,  # never download, fail fast if missing
            )
            elapsed = round((time.perf_counter() - t0) * 1000)
            print(
                f"[BGEEmbedder] ✓ Loaded BGE model '{self.config.model_name}' "
                f"in {elapsed}ms  dim={self._model.get_sentence_embedding_dimension()}  "
                f"device={self.config.device or 'auto'}",
                file=sys.stderr,
            )
        except Exception as exc:
            print(
                f"[BGEEmbedder] Failed to load model '{self.config.model_name}': {exc}. "
                "Falling back to NomicEmbedder (llama.cpp HTTP server).",
                file=sys.stderr,
            )
            self._fallback = NomicEmbedder()

    # ── Public API ────────────────────────────────────────────────────────────

    def embedding_dimension(self) -> int:
        self._resolve()
        if self._fallback:
            return self._fallback.embedding_dimension()
        return int(self._model.get_sentence_embedding_dimension())  # type: ignore[union-attr]

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        self._resolve()
        if self._fallback:
            print(
                f"[BGEEmbedder] Using NomicEmbedder fallback for embed_texts "
                f"({len(texts)} text(s))",
                file=sys.stderr,
            )
            return self._fallback.embed_texts(texts)

        # ── BGE path ──────────────────────────────────────────────────────────
        print(
            f"[BGEEmbedder] Using BGE model for embed_texts ({len(texts)} text(s))",
            file=sys.stderr,
        )
        t0 = time.perf_counter()
        embeddings = self._model.encode(  # type: ignore[union-attr]
            list(texts),
            batch_size=self.config.batch_size,
            normalize_embeddings=self.config.normalize_embeddings,
            show_progress_bar=False,
        )
        elapsed = time.perf_counter() - t0
        print(f"[BGEEmbedder] embed_texts: {elapsed:.3f}s for {len(texts)} text(s)", file=sys.stderr)
        if hasattr(embeddings, "tolist"):
            return embeddings.tolist()
        return [list(v) for v in embeddings]

    def embed_query(self, query: str) -> list[float]:
        """
        Embed query-side text.
        BGE is symmetric — uses the same encode() as documents.
        Nomic fallback uses the search_query: prefix.
        """
        self._resolve()
        if self._fallback:
            print(
                "[BGEEmbedder] Using NomicEmbedder fallback for embed_query",
                file=sys.stderr,
            )
            return self._fallback.embed_query(query)

        # BGE: symmetric — no special prefix needed
        print("[BGEEmbedder] Using BGE model for embed_query", file=sys.stderr)
        result = self.embed_texts([query])
        return result[0]

    def embed_record(self, record: ParsedRecord) -> EmbeddedDocumentRecord:
        self._resolve()
        if self._fallback:
            print(
                f"[BGEEmbedder] Using NomicEmbedder fallback for "
                f"embed_record ({type(record).__name__})",
                file=sys.stderr,
            )
            return self._fallback.embed_record(record)

        print(
            f"[BGEEmbedder] Using BGE model for embed_record ({type(record).__name__})",
            file=sys.stderr,
        )
        t0 = time.perf_counter()
        embedding_text = build_embedding_text(record)
        embedding = self.embed_texts([embedding_text])[0]
        elapsed = time.perf_counter() - t0
        print(f"[BGEEmbedder] embed_record: {elapsed:.3f}s", file=sys.stderr)
        return EmbeddedDocumentRecord(record=record, embedding_text=embedding_text, embedding=embedding)

    def embed_records(self, records: Iterable[ParsedRecord]) -> list[EmbeddedDocumentRecord]:
        materialized = list(records)
        self._resolve()
        if self._fallback:
            print(
                f"[BGEEmbedder] Using NomicEmbedder fallback for "
                f"embed_records ({len(materialized)} record(s))",
                file=sys.stderr,
            )
            return self._fallback.embed_records(materialized)

        print(
            f"[BGEEmbedder] Using BGE model for embed_records ({len(materialized)} record(s))",
            file=sys.stderr,
        )
        t0 = time.perf_counter()
        texts = [build_embedding_text(r) for r in materialized]
        vectors = self.embed_texts(texts) if materialized else []
        elapsed = time.perf_counter() - t0
        print(f"[BGEEmbedder] embed_records: {elapsed:.3f}s for {len(materialized)} record(s)", file=sys.stderr)
        return [
            EmbeddedDocumentRecord(record=r, embedding_text=t, embedding=v)
            for r, t, v in zip(materialized, texts, vectors, strict=False)
        ]


# ─── Persistence ──────────────────────────────────────────────────────────────

def save_embedded_records(records: Iterable[EmbeddedDocumentRecord], path: str | Path) -> Path:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record.to_json_dict(), ensure_ascii=False))
            handle.write("\n")
    return output_path
