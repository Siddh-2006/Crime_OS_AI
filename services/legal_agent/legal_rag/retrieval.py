from __future__ import annotations

import math
import re
import sys
import time
from collections import Counter
from dataclasses import dataclass
from typing import Sequence

from .embedding import BGEEmbedder
from .models import LegalRetrievalBundle, LegalRetrievalResult
from .qdrant_store import LegalQdrantStore
from pathlib import Path

_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9]+")
_SOURCE_SEARCH_LIMIT = 15


def _tokenize(text: str) -> list[str]:
    return _TOKEN_PATTERN.findall((text or "").lower())


@dataclass(slots=True)
class BM25Index:
    tokens_by_doc: list[list[str]]
    term_frequencies_by_doc: list[Counter[str]]
    idf: dict[str, float]
    avg_doc_len: float
    k1: float = 1.5
    b: float = 0.75

    @classmethod
    def build(cls, documents: Sequence[str]) -> "BM25Index":
        tokens_by_doc = [_tokenize(document) for document in documents]
        term_frequencies_by_doc = [Counter(tokens) for tokens in tokens_by_doc]
        document_frequency: Counter[str] = Counter()
        for frequencies in term_frequencies_by_doc:
            document_frequency.update(frequencies.keys())

        doc_count = len(tokens_by_doc)
        avg_doc_len = sum(len(tokens) for tokens in tokens_by_doc) / doc_count if doc_count else 0.0
        idf = {
            term: math.log(1.0 + ((doc_count - df + 0.5) / (df + 0.5)))
            for term, df in document_frequency.items()
        }
        return cls(
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
        return score


class DocumentBM25Retriever:
    def __init__(self, store: LegalQdrantStore) -> None:
        self.store = store
        self._documents = None
        self._index: BM25Index | None = None

    def _load_documents(self):
        if self._documents is None:
            start = time.perf_counter()
            print("[timing] bm25_documents_load:start", file=sys.stderr)
            self._documents = self.store.list_documents()
            elapsed = time.perf_counter() - start
            print(f"[timing] qdrant_scroll: {elapsed:.3f}s for {len(self._documents)} document(s)", file=sys.stderr)
            print("[timing] bm25_documents_load:done", file=sys.stderr)
        return self._documents

    def _load_index(self) -> BM25Index:
        if self._index is None:
            start = time.perf_counter()
            print("[timing] bm25_index_build:start", file=sys.stderr)
            documents = self._load_documents()
            self._index = BM25Index.build([document.bm25_text() for document in documents])
            elapsed = time.perf_counter() - start
            print(f"[timing] bm25_index_build: {elapsed:.3f}s for {len(documents)} document(s)", file=sys.stderr)
            print("[timing] bm25_index_build:done", file=sys.stderr)
        return self._index

    def search(
        self,
        query: str,
        *,
        limit: int = _SOURCE_SEARCH_LIMIT,
        act_filter: Sequence[str] | None = None,
    ) -> list[LegalRetrievalResult]:
        start_total = time.perf_counter()
        print("[timing] bm25_search:start", file=sys.stderr)
        query_tokens = _tokenize(query)
        if not query_tokens:
            print("[timing] bm25_search:empty_query", file=sys.stderr)
            return []

        allowed = {item.upper() for item in act_filter} if act_filter else None
        start_bm25 = time.perf_counter()
        documents = self._load_documents()
        index = self._load_index()

        scored: list[tuple[int, float]] = []
        for doc_index, document in enumerate(documents):
            if allowed and document.act.upper() not in allowed:
                continue
            score = index.score_document(query_tokens, doc_index)
            if score > 0.0:
                scored.append((doc_index, score))

        scored.sort(key=lambda item: item[1], reverse=True)
        scored = scored[:limit]
        bm25_elapsed = time.perf_counter() - start_bm25
        print(f"[timing] bm25_search: {bm25_elapsed:.3f}s for {len(scored)} result(s)", file=sys.stderr)
        print("[timing] bm25_search:done", file=sys.stderr)
        return [
            LegalRetrievalResult(
                record=documents[doc_index],
                retrieval_score=score,
                rerank_score=score,
                context_type="bm25_candidate",
            )
            for doc_index, score in scored
        ]


@dataclass(slots=True)
class _FusedCandidate:
    record: object
    score: float = 0.0


class WeightedRRFFusion:
    def __init__(self, *, bm25_weight: float = 0.4, vector_weight: float = 0.6, rrf_k: float = 60.0) -> None:
        self.bm25_weight = bm25_weight
        self.vector_weight = vector_weight
        self.rrf_k = rrf_k

    @staticmethod
    def _section_key(result: LegalRetrievalResult) -> tuple[str, str]:
        return (result.act, result.serial_number)

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
                    record=candidate.record,  # type: ignore[arg-type]
                    retrieval_score=normalized_score,
                    rerank_score=0.0,
                    context_type="fused_candidate",
                )
            )
        return results


@dataclass(slots=True)
class RerankerConfig:
    model_name: str = "BAAI/bge-reranker-v2-m3"
    device: str | None = None
    batch_size: int = 8
    cache_dir = str(
        Path(__file__).resolve().parent.parent / "onnx_reranker"
    )


class LegalReranker:
    def __init__(self, config: RerankerConfig | None = None) -> None:
        self.config = config or RerankerConfig()
        self._model = None
        self._tokenizer = None

    # def _load_model(self):
    #     if self._model is not None:
    #         return self._model
    #     try:
    #         from sentence_transformers import CrossEncoder
    #     except Exception as exc:  # pragma: no cover - dependency missing
    #         raise RuntimeError(
    #             "sentence-transformers is required for reranking. Install project dependencies first."
    #         ) from exc
    #     self._model = CrossEncoder(self.config.model_name, device=self.config.device)
    #     return self._model

    def _load_model(self):
        if self._model is not None:
            print("[timing] reranker_load:cache_hit", file=sys.stderr)
            return self._model
        try:
            # Import ORT modules instead of sentence-transformers CrossEncoder
            from optimum.onnxruntime import ORTModelForSequenceClassification
            from transformers import AutoTokenizer
        except Exception as exc:
            raise RuntimeError("optimum[onnxruntime] and transformers are required.") from exc

        # 1. Load the model directly using ORT (automatically exports and handles cache)
        # Note: Set export=True only on the very first run, then set to False for instant boot
        print("[timing] reranker_load:start", file=sys.stderr)

        self._model = ORTModelForSequenceClassification.from_pretrained(
            self.config.cache_dir,
            provider="CPUExecutionProvider"
        )

        self._tokenizer = AutoTokenizer.from_pretrained(
            self.config.cache_dir
        )
        print("[timing] reranker_load:done", file=sys.stderr)
        return self._model


    # def rerank(self, query: str, candidates: Sequence[LegalRetrievalResult]) -> list[LegalRetrievalResult]:
    #     if not candidates:
    #         return []
    #     model = self._load_model()
    #     pairs = [(query, candidate.to_section_block()) for candidate in candidates]
    #     scores = model.predict(pairs, batch_size=self.config.batch_size, show_progress_bar=False)
    #     scored = list(candidates)
    #     for candidate, score in zip(scored, scores, strict=False):
    #         candidate.rerank_score = float(score)
    #     scored.sort(key=lambda item: item.rerank_score, reverse=True)
    #     return scored

    def rerank(self, query: str, candidates: Sequence[LegalRetrievalResult]) -> list[LegalRetrievalResult]:
        if not candidates:
            return []
        print(f"[timing] rerank:start candidates={len(candidates)}", file=sys.stderr)
        model = self._load_model()
        pairs = [(query, candidate.to_section_block()) for candidate in candidates]
        
        # --- MINIMAL OPTIMIZATION BLOCK ADDED ---
        # 1. Tokenize the pairs exactly as before, forcing truncation to fit the model window
        inputs = self._tokenizer(pairs, padding=True, truncation=True, return_tensors="pt", max_length=512)
        
        # 2. Run local ONNX inference pass
        import torch
        with torch.no_grad():
            outputs = model(**inputs)
            scores = outputs.logits.squeeze(-1)
            if scores.ndim == 0:
                scores = [float(scores)]
            else:
                scores = scores.tolist()
        # ----------------------------------------

        # Force single-item outputs into a list if only 1 candidate was evaluated
        if isinstance(scores, float):
            scores = [scores]

        scored = list(candidates)
        for candidate, score in zip(scored, scores, strict=False):
            candidate.rerank_score = float(score)
        scored.sort(key=lambda item: item.rerank_score, reverse=True)
        print("[timing] rerank:done", file=sys.stderr)
        return scored


class LegalRetriever:
    def __init__(
        self,
        *,
        embedder: BGEEmbedder | None = None,
        store: LegalQdrantStore | None = None,
        reranker: LegalReranker | None = None,
    ) -> None:
        print("[timing] retriever_init:start", file=sys.stderr)
        self.embedder = embedder or BGEEmbedder()
        self.store = store or LegalQdrantStore()
        self.reranker = reranker or LegalReranker()
        self.bm25 = DocumentBM25Retriever(self.store)
        self.fusion = WeightedRRFFusion()
        # Warmup disabled intentionally; models now load lazily on first use and then stay cached.
        # print("[timing] retriever_init:warm_embedder:start", file=sys.stderr)
        # self.embedder._load_model()
        # print("[timing] retriever_init:warm_reranker:start", file=sys.stderr)
        # self.reranker._load_model()
        print("[timing] retriever_init:done", file=sys.stderr)

    @staticmethod
    def _filter_by_act(results: Sequence[LegalRetrievalResult], act_filter: Sequence[str] | None) -> list[LegalRetrievalResult]:
        if not act_filter:
            return list(results)
        allowed = {item.upper() for item in act_filter}
        return [item for item in results if item.act.upper() in allowed]

    def retrieve(
        self,
        complaint: str,
        *,
        top_k: int = 15,
        final_k: int = 5,
        act_filter: Sequence[str] | None = None,
    ) -> LegalRetrievalBundle:
        start_total = time.perf_counter()
        print("[timing] retrieval:start", file=sys.stderr)
        start_embed = time.perf_counter()
        print("[timing] retrieval:bm25_stage:start", file=sys.stderr)
        bm25_results = self.bm25.search(complaint, limit=_SOURCE_SEARCH_LIMIT, act_filter=act_filter)
        bm25_elapsed = time.perf_counter() - start_embed
        print(f"[timing] bm25_stage_total: {bm25_elapsed:.3f}s", file=sys.stderr)

        start_embed = time.perf_counter()
        print("[timing] retrieval:query_embed:start", file=sys.stderr)
        query_vector = self.embedder.embed_texts([complaint])[0]
        embed_elapsed = time.perf_counter() - start_embed
        print(f"[timing] query_embed: {embed_elapsed:.3f}s", file=sys.stderr)

        start_qdrant = time.perf_counter()
        print("[timing] retrieval:qdrant_vector_search:start", file=sys.stderr)
        vector_results = self._filter_by_act(self.store.search(query_vector, limit=_SOURCE_SEARCH_LIMIT), act_filter)
        qdrant_elapsed = time.perf_counter() - start_qdrant
        print(f"[timing] qdrant_vector_search: {qdrant_elapsed:.3f}s for {len(vector_results)} result(s)", file=sys.stderr)

        start_fusion = time.perf_counter()
        print("[timing] retrieval:fusion:start", file=sys.stderr)
        fused_results = self.fusion.fuse(bm25_results, vector_results, limit=top_k)
        fusion_elapsed = time.perf_counter() - start_fusion
        print(f"[timing] fusion: {fusion_elapsed:.3f}s for {len(fused_results)} candidate(s)", file=sys.stderr)

        start_rerank = time.perf_counter()
        print("[timing] retrieval:rerank:start", file=sys.stderr)
        reranked = self.reranker.rerank(complaint, fused_results)
        rerank_elapsed = time.perf_counter() - start_rerank
        print(f"[timing] rerank: {rerank_elapsed:.3f}s for {len(reranked)} candidate(s)", file=sys.stderr)

        top_sections = reranked[:final_k]
        start_refs = time.perf_counter()
        print("[timing] retrieval:reference_expand:start", file=sys.stderr)
        referenced_sections = self._expand_references(top_sections)
        refs_elapsed = time.perf_counter() - start_refs
        total_elapsed = time.perf_counter() - start_total
        print(f"[timing] reference_expand: {refs_elapsed:.3f}s for {len(referenced_sections)} referenced(s)", file=sys.stderr)
        print(f"[timing] retrieval_total: {total_elapsed:.3f}s", file=sys.stderr)
        print("[timing] retrieval:done", file=sys.stderr)
        return LegalRetrievalBundle(
            complaint=complaint,
            top_20=fused_results,
            top_5=top_sections,
            context_sections=referenced_sections,
        )

    def _expand_references(self, sections: Sequence[LegalRetrievalResult]) -> list[LegalRetrievalResult]:
        referenced: list[LegalRetrievalResult] = []
        seen_keys = {(section.act, section.serial_number) for section in sections}

        for section in sections:
            refs = self.store.fetch_sections(section.act, section.references)
            for ref_record in refs:
                key = (section.act, ref_record.serial_number)
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
