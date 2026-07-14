from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from typing import Sequence

from ingestion.schemas import LegalSectionRecord

from .embedding import BGEEmbedder
from .models import LegalRetrievalBundle, LegalRetrievalResult
from .qdrant_store import LegalQdrantStore

_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9]+")
_SOURCE_SEARCH_LIMIT = 15
_BM25_FIELD_WEIGHTS: dict[str, float] = {
    "chapter_tag": 2.0,
    "summary": 1.0,
    "content": 1.0,
}


def _tokenize(text: str) -> list[str]:
    return _TOKEN_PATTERN.findall(text.lower())


def _normalize_chapter_tags(value: object) -> str:
    if isinstance(value, (list, tuple)):
        return ", ".join(str(item) for item in value if str(item).strip())
    if value is None:
        return ""
    return str(value)


def _field_text(record: LegalSectionRecord, field_name: str) -> str:
    if field_name == "chapter_tag":
        return _normalize_chapter_tags(record.chapter_tag)
    if field_name == "summary":
        return record.summary or ""
    if field_name == "content":
        return record.content or ""
    raise KeyError(f"Unsupported BM25 field: {field_name}")


@dataclass(slots=True)
class _BM25FieldIndex:
    field_name: str
    weight: float
    tokens_by_doc: list[list[str]]
    term_frequencies_by_doc: list[Counter[str]]
    idf: dict[str, float]
    avg_doc_len: float
    k1: float = 1.5
    b: float = 0.75

    @classmethod
    def build(cls, records: Sequence[LegalSectionRecord], field_name: str, weight: float) -> "_BM25FieldIndex":
        tokens_by_doc: list[list[str]] = []
        term_frequencies_by_doc: list[Counter[str]] = []
        document_frequency: Counter[str] = Counter()

        for record in records:
            tokens = _tokenize(_field_text(record, field_name))
            tokens_by_doc.append(tokens)
            frequencies = Counter(tokens)
            term_frequencies_by_doc.append(frequencies)
            document_frequency.update(frequencies.keys())

        doc_count = len(records)
        avg_doc_len = sum(len(tokens) for tokens in tokens_by_doc) / doc_count if doc_count else 0.0
        idf = {
            term: math.log(1.0 + ((doc_count - df + 0.5) / (df + 0.5)))
            for term, df in document_frequency.items()
        }
        return cls(
            field_name=field_name,
            weight=weight,
            tokens_by_doc=tokens_by_doc,
            term_frequencies_by_doc=term_frequencies_by_doc,
            idf=idf,
            avg_doc_len=avg_doc_len,
        )

    def score_document(self, query_tokens: Sequence[str], doc_index: int) -> float:
        if not query_tokens or not self.tokens_by_doc:
            return 0.0

        doc_len = len(self.tokens_by_doc[doc_index])
        if doc_len == 0 or self.avg_doc_len <= 0:
            return 0.0

        query_counts = Counter(query_tokens)
        doc_frequencies = self.term_frequencies_by_doc[doc_index]
        normalization = self.k1 * (1.0 - self.b + self.b * (doc_len / self.avg_doc_len))

        score = 0.0
        for token, query_frequency in query_counts.items():
            term_frequency = doc_frequencies.get(token)
            if not term_frequency:
                continue
            idf = self.idf.get(token)
            if idf is None:
                continue
            score += query_frequency * idf * ((term_frequency * (self.k1 + 1.0)) / (term_frequency + normalization))
        return score * self.weight


class LegalBM25Retriever:
    def __init__(self, store: LegalQdrantStore, *, field_weights: dict[str, float] | None = None) -> None:
        self.store = store
        self.field_weights = dict(field_weights or _BM25_FIELD_WEIGHTS)
        self._records: list[LegalSectionRecord] | None = None
        self._field_indexes: dict[str, _BM25FieldIndex] | None = None

    def _load_records(self) -> list[LegalSectionRecord]:
        if self._records is None:
            self._records = self.store.list_sections()
        return self._records

    def _ensure_field_indexes(self) -> dict[str, _BM25FieldIndex]:
        if self._field_indexes is None:
            records = self._load_records()
            self._field_indexes = {
                field_name: _BM25FieldIndex.build(records, field_name, weight)
                for field_name, weight in self.field_weights.items()
            }
        return self._field_indexes

    def search(
        self,
        query: str,
        *,
        limit: int = _SOURCE_SEARCH_LIMIT,
        act_filter: Sequence[str] | None = None,
    ) -> list[LegalRetrievalResult]:
        query_tokens = _tokenize(query)
        if not query_tokens:
            return []

        allowed = {item.upper() for item in act_filter} if act_filter else None
        records = self._load_records()
        field_indexes = self._ensure_field_indexes()

        scored: list[tuple[LegalSectionRecord, float]] = []
        for doc_index, record in enumerate(records):
            if allowed and record.act.upper() not in allowed:
                continue

            total_score = 0.0
            for field_index in field_indexes.values():
                total_score += field_index.score_document(query_tokens, doc_index)
            if total_score > 0.0:
                scored.append((record, total_score))

        scored.sort(key=lambda item: item[1], reverse=True)
        scored = scored[:limit]
        return [
            LegalRetrievalResult(
                record=record,
                retrieval_score=score,
                rerank_score=score,
                context_type="bm25_candidate",
            )
            for record, score in scored
        ]


@dataclass(slots=True)
class _FusedCandidate:
    record: LegalSectionRecord
    score: float = 0.0


class WeightedRRFFusion:
    def __init__(self, *, bm25_weight: float = 0.6, vector_weight: float = 0.4, rrf_k: float = 60.0) -> None:
        self.bm25_weight = bm25_weight
        self.vector_weight = vector_weight
        self.rrf_k = rrf_k

    @staticmethod
    def _section_key(result: LegalRetrievalResult) -> tuple[str, str]:
        return (result.record.act, result.record.serial_number)

    def _accumulate(
        self,
        fused: dict[tuple[str, str], _FusedCandidate],
        ranked_results: Sequence[LegalRetrievalResult],
        *,
        weight: float,
    ) -> None:
        for rank, result in enumerate(ranked_results, start=1):
            key = self._section_key(result)
            candidate = fused.get(key)
            if candidate is None:
                candidate = _FusedCandidate(record=result.record)
                fused[key] = candidate
            candidate.score += weight / (self.rrf_k + rank)

    def fuse(
        self,
        bm25_results: Sequence[LegalRetrievalResult],
        vector_results: Sequence[LegalRetrievalResult],
        *,
        limit: int | None = None,
    ) -> list[LegalRetrievalResult]:
        fused: dict[tuple[str, str], _FusedCandidate] = {}
        self._accumulate(fused, bm25_results, weight=self.bm25_weight)
        self._accumulate(fused, vector_results, weight=self.vector_weight)

        ordered = sorted(fused.values(), key=lambda item: item.score, reverse=True)
        if limit is not None:
            ordered = ordered[:limit]
        if not ordered:
            return []

        max_score = ordered[0].score
        results: list[LegalRetrievalResult] = []
        for candidate in ordered:
            normalized_score = candidate.score / max_score if max_score else 0.0
            results.append(
                LegalRetrievalResult(
                    record=candidate.record,
                    retrieval_score=normalized_score,
                    rerank_score=0.0,
                    context_type="fused_candidate",
                )
            )
        return results


def _candidate_text(record: LegalSectionRecord) -> str:
    return (
        f"Act: {record.act}\n"
        f"Chapter: {record.chapter or ''}\n"
        f"Section: {record.serial_number}\n"
        f"Content: {record.content}"
    )


@dataclass(slots=True)
class RerankerConfig:
    model_name: str = "BAAI/bge-reranker-v2-m3"
    device: str | None = None
    batch_size: int = 8


class LegalReranker:
    def __init__(self, config: RerankerConfig | None = None) -> None:
        self.config = config or RerankerConfig()
        self._model = None

    def _load_model(self):
        if self._model is not None:
            return self._model
        try:
            from sentence_transformers import CrossEncoder
        except Exception as exc:  # pragma: no cover - dependency missing
            raise RuntimeError(
                "sentence-transformers is required for reranking. Install project dependencies first."
            ) from exc
        self._model = CrossEncoder(self.config.model_name, device=self.config.device)
        return self._model

    def rerank(self, query: str, candidates: Sequence[LegalRetrievalResult]) -> list[LegalRetrievalResult]:
        if not candidates:
            return []
        model = self._load_model()
        pairs = [(query, _candidate_text(candidate.record)) for candidate in candidates]
        scores = model.predict(pairs, batch_size=self.config.batch_size, show_progress_bar=False)
        scored = list(candidates)
        for candidate, score in zip(scored, scores, strict=False):
            candidate.rerank_score = float(score)
        scored.sort(key=lambda item: item.rerank_score, reverse=True)
        return scored


class LegalRetriever:
    def __init__(
        self,
        *,
        embedder: BGEEmbedder | None = None,
        store: LegalQdrantStore | None = None,
        reranker: LegalReranker | None = None,
    ) -> None:
        self.embedder = embedder or BGEEmbedder()
        self.store = store or LegalQdrantStore()
        self.reranker = reranker or LegalReranker()
        self.bm25 = LegalBM25Retriever(self.store)
        self.fusion = WeightedRRFFusion()

    @staticmethod
    def _filter_by_act(results: Sequence[LegalRetrievalResult], act_filter: Sequence[str] | None) -> list[LegalRetrievalResult]:
        if not act_filter:
            return list(results)
        allowed = {item.upper() for item in act_filter}
        return [item for item in results if item.record.act.upper() in allowed]

    def retrieve(
        self,
        complaint: str,
        *,
        top_k: int = 20,
        final_k: int = 5,
        act_filter: Sequence[str] | None = None,
    ) -> LegalRetrievalBundle:
        bm25_results = self.bm25.search(complaint, limit=_SOURCE_SEARCH_LIMIT, act_filter=act_filter)
        query_vector = self.embedder.embed_texts([complaint])[0]
        vector_results = self._filter_by_act(self.store.search(query_vector, limit=_SOURCE_SEARCH_LIMIT), act_filter)

        fused_results = self.fusion.fuse(bm25_results, vector_results, limit=top_k)
        reranked = self.reranker.rerank(complaint, fused_results)
        top_sections = reranked[:final_k]
        referenced_sections = self._expand_references(top_sections)
        return LegalRetrievalBundle(
            complaint=complaint,
            top_20=fused_results,
            top_5=top_sections,
            context_sections=referenced_sections,
        )

    def _expand_references(self, sections: Sequence[LegalRetrievalResult]) -> list[LegalRetrievalResult]:
        referenced: list[LegalRetrievalResult] = []
        seen_keys = {(section.record.act, section.record.serial_number) for section in sections}

        for section in sections:
            refs = self.store.fetch_sections(section.record.act, section.record.references)
            for ref_record in refs:
                key = (ref_record.act, ref_record.serial_number)
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                referenced.append(
                    LegalRetrievalResult(
                        record=ref_record,
                        retrieval_score=0.0,
                        rerank_score=0.0,
                        context_type="referenced_section",
                    )
                )
        return referenced
