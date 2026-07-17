from __future__ import annotations

import argparse
from pathlib import Path

from legal_rag.embedding import BGEEmbeddingConfig, BGEEmbedder, load_legal_records, save_embedded_records


def main() -> int:
    parser = argparse.ArgumentParser(description="Load parsed legal JSON and generate embeddings.")
    parser.add_argument("input", type=Path, help="Parsed JSON file or directory containing parsed JSON files")
    parser.add_argument("--out", type=Path, default=Path("embedded") / "legal_embeddings.jsonl", help="Output JSONL file")
    parser.add_argument("--model", default="BAAI/bge-m3", help="SentenceTransformer embedding model")
    parser.add_argument("--device", default=None, help="Torch device, e.g. cpu, cuda, mps")
    args = parser.parse_args()

    records = load_legal_records(args.input)
    embedder = BGEEmbedder(BGEEmbeddingConfig(model_name=args.model, device=args.device))
    embedded = embedder.embed_records(records)
    save_embedded_records(embedded, args.out)
    print(f"Embedded {len(embedded)} legal records to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
