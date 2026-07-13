from __future__ import annotations

import argparse
import json

from legal_rag.analysis import LegalAnalysisService, compute_confidence
from legal_rag.retrieval import LegalRetriever
from llm.qwen_client import QwenClient


def _print_results(title: str, results) -> None:
    print(title)
    for index, result in enumerate(results, start=1):
        print(
            f"{index}. {result.section_key} | Act={result.act} | Section={result.serial_number} | "
            f"Retrieval Score={result.retrieval_score:.4f} | Rerank Score={result.rerank_score:.4f} | "
            f"Context={result.context_type}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the legal copilot pipeline for a complaint.")
    parser.add_argument("complaint", help="Natural language complaint")
    parser.add_argument("--top-k", type=int, default=20, help="Vector search depth")
    parser.add_argument("--final-k", type=int, default=5, help="Reranked output size")
    parser.add_argument("--device", default=None, help="Local model device, e.g. cpu or cuda")
    parser.add_argument("--model", default="Qwen/Qwen3-8B-Instruct", help="Local Qwen model name or path")
    parser.add_argument("--act", action="append", dest="acts", help="Optional legal act filter; can be repeated")
    args = parser.parse_args()

    try:
        retriever = LegalRetriever()
        bundle = retriever.retrieve(args.complaint, top_k=args.top_k, final_k=args.final_k, act_filter=args.acts)
        confidence = compute_confidence(bundle)
        llm = QwenClient(model_name=args.model, device=args.device)
        analysis = LegalAnalysisService(llm).analyze(bundle)
    except RuntimeError as exc:
        print(str(exc))
        return 1

    _print_results("Top 20 Retrieved", bundle.top_20)
    print()
    _print_results("Top 5 Reranked", bundle.top_5)
    print()
    _print_results("Reference-Expanded", bundle.context_sections)
    print()
    print(f"Confidence: {confidence.level} ({confidence.score:.2f})")
    print()
    print(json.dumps(analysis.to_json_dict(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
