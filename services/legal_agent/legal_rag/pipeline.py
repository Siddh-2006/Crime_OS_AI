from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from .analysis import LegalAnalysisService
from .models import LegalAnalysisResult, LegalRetrievalBundle
from .retrieval import LegalRetriever
from llm.qwen_client import QwenClient


@dataclass(slots=True)
class LegalRAGPipeline:
    retriever: LegalRetriever
    llm_client: QwenClient

    def retrieve(self, complaint: str, *, top_k: int = 20, final_k: int = 5, act_filter: Sequence[str] | None = None) -> LegalRetrievalBundle:
        return self.retriever.retrieve(complaint, top_k=top_k, final_k=final_k, act_filter=act_filter)

    def analyze(self, complaint: str, *, top_k: int = 20, final_k: int = 5, act_filter: Sequence[str] | None = None) -> LegalAnalysisResult:
        bundle = self.retrieve(complaint, top_k=top_k, final_k=final_k, act_filter=act_filter)
        service = LegalAnalysisService(self.llm_client)
        return service.analyze(bundle)

    def answer(self, complaint: str, *, top_k: int = 20, final_k: int = 5, act_filter: Sequence[str] | None = None) -> dict:
        return self.analyze(complaint, top_k=top_k, final_k=final_k, act_filter=act_filter).to_json_dict()
