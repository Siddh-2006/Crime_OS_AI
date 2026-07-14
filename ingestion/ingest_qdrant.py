from __future__ import annotations

import argparse
import json
from pathlib import Path

from legal_rag.models import EmbeddedLegalRecord
from legal_rag.qdrant_store import LegalQdrantConfig, LegalQdrantStore
from ingestion.schemas import LegalSectionRecord


def load_embedded_records(path: str | Path) -> list[EmbeddedLegalRecord]:
    source = Path(path)
    records: list[EmbeddedLegalRecord] = []
    if source.suffix.lower() == ".jsonl":
        lines = source.read_text(encoding="utf-8").splitlines()
        items = [json.loads(line) for line in lines if line.strip()]
    else:
        data = json.loads(source.read_text(encoding="utf-8"))
        items = data if isinstance(data, list) else data.get("records", [data])
    for item in items:
        record = LegalSectionRecord.model_validate(item["record"])
        embedding_text = str(item.get("embedding_text") or "")
        embedding = list(item.get("embedding") or [])
        kwargs = {
            "record": record,
            "embedding_text": embedding_text,
            "embedding": embedding,
        }
        if item.get("uuid"):
            kwargs["uuid"] = str(item["uuid"])
        records.append(EmbeddedLegalRecord(**kwargs))
    return records


def main() -> int:
    parser = argparse.ArgumentParser(description="Upload embedded legal records into Qdrant.")
    parser.add_argument("input", type=Path, help="Embedded JSONL or JSON file")
    parser.add_argument("--url", default="http://localhost:6333", help="Qdrant URL")
    parser.add_argument("--collection", default="legal", help="Qdrant collection name")
    args = parser.parse_args()

    embedded = load_embedded_records(args.input)
    if not embedded:
        print("No embedded records found.")
        return 0

    store = LegalQdrantStore(LegalQdrantConfig(url=args.url, collection_name=args.collection))
    store.upsert_embeddings(embedded)
    print(f"Uploaded {len(embedded)} embeddings to Qdrant collection '{args.collection}'")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
