from __future__ import annotations

import argparse
from pathlib import Path

from legal_rag.embedding import BGEEmbeddingConfig, BGEEmbedder, load_legal_records, load_dept_records, load_sop_records,save_embedded_records


def main() -> int:
    parser = argparse.ArgumentParser(description="Load parsed legal JSON and generate embeddings.")
    parser.add_argument("input", type=Path, help="Parsed JSON file or directory containing parsed JSON files")
    parser.add_argument("--out", type=Path, default=Path("embedded") / "legal_embeddings.jsonl", help="Output JSONL file")
    parser.add_argument("--model", default="BAAI/bge-m3", help="SentenceTransformer embedding model")
    parser.add_argument(
        "--type",
        choices=["legal", "dept", "sop"],
        default="legal",
        help="Record type to embed",
    )
    parser.add_argument("--device", default=None, help="Torch device, e.g. cpu, cuda, mps")
    args = parser.parse_args()

    if args.type == "legal":
        records = load_legal_records(args.input)
    elif args.type == "dept":
        records = load_dept_records(args.input)
    elif args.type == "sop":
        records = load_sop_records(args.input)
    else:
        raise ValueError(f"Unknown type: {args.type}")
    embedder = BGEEmbedder(BGEEmbeddingConfig(model_name=args.model, device=args.device))
    if args.type == "legal":
        embedded = embedder.embed_records(records)
    elif args.type == "dept":
        embedded = embedder.embed_records(records)
    elif args.type == "sop":
        embedded = embedder.embed_records(records)
    else:
        raise ValueError(f"Unknown type: {args.type}")
    # embedded = embedder.embed_records(records)
    save_embedded_records(embedded, args.out)
    print(f"Embedded {len(embedded)} legal records to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
