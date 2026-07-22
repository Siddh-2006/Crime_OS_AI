from __future__ import annotations

# ─── OLD CLI using BGEEmbedder (sentence-transformers, in-process) ─────────────
# The embedding model has been replaced with nomic-embed-text-v2-moe.Q4_K_M
# served by llama.cpp at http://127.0.0.1:8003.
# BGEEmbedder is now an alias for NomicEmbedder.
# The --model flag is kept for CLI compatibility but has no effect;
# the model is fixed to nomic-embed-text-v2-moe via LEGAL_AGENT_LLAMA_CPP_URL.
# ─────────────────────────────────────────────────────────────────────────────

import argparse
from pathlib import Path

from legal_rag.embedding import BGEEmbeddingConfig, BGEEmbedder, load_parsed_records, save_embedded_records


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Load parsed JSON records and generate embeddings via "
            "nomic-embed-text-v2-moe.Q4_K_M (llama.cpp server at port 8003)."
        )
    )
    parser.add_argument(
        "input",
        type=Path,
        help="Parsed JSON file or directory of parsed JSON files",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("embedded") / "all_embeddings.jsonl",
        help="Output JSONL file",
    )
    parser.add_argument(
        "--model",
        default="nomic-embed-text-v2-moe",
        help=(
            "Embedding model name (ignored — model is fixed to nomic-embed-text-v2-moe "
            "via llama.cpp server). Kept for CLI compatibility."
        ),
    )
    parser.add_argument(
        "--type",
        choices=["auto", "legal", "dept", "sop"],
        default="auto",
        help="Force a specific record type or auto-detect from JSON shape",
    )
    parser.add_argument(
        "--device",
        default=None,
        help="Ignored — llama.cpp server handles device selection.",
    )
    args = parser.parse_args()

    records = load_parsed_records(args.input, record_type=args.type)
    # BGEEmbedder is now NomicEmbedder; BGEEmbeddingConfig fields are no-ops
    embedder = BGEEmbedder(BGEEmbeddingConfig(model_name=args.model, device=args.device))
    embedded = embedder.embed_records(records)
    save_embedded_records(embedded, args.out)
    print(f"Embedded {len(embedded)} records → {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
