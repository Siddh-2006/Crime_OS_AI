from __future__ import annotations

import argparse
import sys
from pathlib import Path

parent_path = Path(__file__).resolve().parent.parent
sys.path.append(str(parent_path))
from legal_rag.analysis import compute_confidence
from legal_rag.retrieval import LegalRetriever


def _print_results(title: str, results) -> None:
    print(title)
    for index, result in enumerate(results, start=1):
        display_label = "Section"
        display_value = result.serial_number
        if result.schema_name == "dept_registry":
            display_label = "Entity"
            display_value = result.record.entity_name
        elif result.schema_name == "sop":
            display_label = "Crime Type"
            display_value = result.record.crime_type
        print(
            f"{index}. Act={result.act} {display_label}={display_value} "
            f"Retrieval Score={result.retrieval_score:.4f} Rerank Score={result.rerank_score:.4f} "
            f"Context={result.context_type}"
        )


def _print_sections(title: str, results) -> None:
    print(title)
    for index, result in enumerate(results, start=1):
        display_label = "Section"
        display_value = result.serial_number
        if result.schema_name == "dept_registry":
            display_label = "Entity"
            display_value = result.record.entity_name or result.serial_number
        elif result.schema_name == "sop":
            display_label = "Crime Type"
            display_value = result.record.crime_type or result.serial_number
        print(
            f"{index}. {result.section_key} | Act={result.act} | {display_label}={display_value} | "
            f"Context={result.context_type}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate legal retrieval quality for a complaint.")
    parser.add_argument("complaint", help="Natural language complaint")
    parser.add_argument("--top-k", type=int, default=15, help="Fused candidate count passed to reranking")
    parser.add_argument("--final-k", type=int, default=5, help="Reranked output size")
    parser.add_argument("--act", action="append", dest="acts", help="Optional legal act filter; can be repeated")
    args = parser.parse_args()

    try:
        retriever = LegalRetriever()
        bundle = retriever.retrieve(args.complaint, top_k=args.top_k, final_k=args.final_k, act_filter=args.acts)
    except RuntimeError as exc:
        print(str(exc))
        return 1
    confidence = compute_confidence(bundle)

    _print_results("Top Fused Candidates", bundle.top_20)
    print()
    _print_results("Top 5 Reranked", bundle.top_5)
    print()
    _print_sections("Reference-Expanded", bundle.context_sections)
    print()
    print(f"Confidence: {confidence.level} ({confidence.score:.2f})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
