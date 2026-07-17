# Legal Copilot Pipeline

This repository now supports a production-style legal RAG pipeline for:

- BNS
- BNSS
- BSA

It is designed for police-facing legal assistance, not chatbot-style open-ended conversation.

## Pipeline

Complaint
→ Embedding
→ Qdrant
→ Retrieval
→ Reranking
→ Local Qwen reasoning

## Embedding Model

- `BAAI/bge-m3`
- Local inference only
- `sentence-transformers`

## Reranker

- `BAAI/bge-reranker-v2-m3`
- Local inference only

## Vector Store

- Qdrant Local
- Single collection: `legal`
- Run locally with:

```bash
docker run -p 6333:6333 qdrant/qdrant
```

## Key Commands

Generate embeddings from parsed JSON:

```bash
python -m ingestion.embed_records parsed/BNS.json --out embedded/legal_embeddings.jsonl
```

Upload embeddings into Qdrant:

```bash
python -m ingestion.ingest_qdrant embedded/legal_embeddings.jsonl
```

Evaluate retrieval quality:

```bash
python scripts/evaluate_retrieval.py "Victim lost ₹50,000 through a fake UPI collect request."
```

Run the full legal copilot pipeline:

```bash
python scripts/run_legal_copilot.py "Victim lost ₹50,000 through a fake UPI collect request."
```

Inspect retrieval quality only:

```bash
python scripts/evaluate_retrieval.py "Victim lost ₹50,000 through a fake UPI collect request."
```

The full terminal flow prints:

- Top 20 retrieved sections
- Top 5 reranked sections
- Reference-expanded sections
- Confidence score and level
- Final structured legal analysis JSON

## Notes

- The legal parsers use textual section markers only.
- Chapter metadata and chapter tags are carried into embeddings.
- Reference expansion is one level deep only.
- NCRP SOP parsing remains separate.
