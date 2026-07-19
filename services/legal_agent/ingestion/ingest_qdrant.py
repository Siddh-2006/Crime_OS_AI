from __future__ import annotations

import argparse
import json
from pathlib import Path

from legal_rag.models import EmbeddedDocumentRecord
from legal_rag.qdrant_store import LegalQdrantConfig, LegalQdrantStore


def load_embedded_records(path: str | Path) -> list[EmbeddedDocumentRecord]:
    source = Path(path)
    records: list[EmbeddedDocumentRecord] = []
    if source.suffix.lower() == ".jsonl":
        items = [json.loads(line) for line in source.read_text(encoding="utf-8").splitlines() if line.strip()]
    else:
        data = json.loads(source.read_text(encoding="utf-8"))
        items = data if isinstance(data, list) else data.get("records", [data])
    for item in items:
        record = item.get("record") or {}
        embedding_text = str(item.get("embedding_text") or "")
        embedding = list(item.get("embedding") or [])
        uuid_value = item.get("uuid")
        kwargs = {
            "record": record,
            "embedding_text": embedding_text,
            "embedding": embedding,
        }
        if uuid_value:
            kwargs["uuid"] = str(uuid_value)
        records.append(EmbeddedDocumentRecord(**kwargs))
    return records


def main() -> int:
    parser = argparse.ArgumentParser(description="Upload embedded legal records into Qdrant.")
    parser.add_argument("input", type=Path, help="Embedded JSONL or JSON file")
    parser.add_argument("--url", default=None, help="Qdrant URL (if using docker/server)")
    parser.add_argument("--path", default="./qdrant_local_storage", help="Local Qdrant storage path")

    parser.add_argument("--collection", default="light", help="Qdrant collection name")
    args = parser.parse_args()

    embedded = load_embedded_records(args.input)
    if not embedded:
        print("No embedded records found.")
        return 0

    store = LegalQdrantStore(LegalQdrantConfig(url=args.url, path=args.path, collection_name=args.collection))

    store.upsert_embeddings(embedded)
    print(f"Uploaded {len(embedded)} embeddings to Qdrant collection '{args.collection}'")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
