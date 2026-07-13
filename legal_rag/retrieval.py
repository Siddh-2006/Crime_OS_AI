from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

from ingestion.schemas import LegalSectionRecord

from .embedding import BGEEmbedder
from .models import LegalRetrievalBundle, LegalRetrievalResult
from .qdrant_store import LegalQdrantStore


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

    def retrieve(
        self,
        complaint: str,
        *,
        top_k: int = 20,
        final_k: int = 5,
        act_filter: Sequence[str] | None = None,
    ) -> LegalRetrievalBundle:
        query_vector = self.embedder.embed_texts([complaint])[0]
        retrieved = self.store.search(query_vector, limit=top_k)

        if act_filter:
            allowed = {item.upper() for item in act_filter}
            retrieved = [item for item in retrieved if item.record.act.upper() in allowed]

        reranked = self.reranker.rerank(complaint, retrieved)
        top_sections = reranked[:final_k]
        referenced_sections = self._expand_references(top_sections)
        return LegalRetrievalBundle(
            complaint=complaint,
            top_20=retrieved,
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
