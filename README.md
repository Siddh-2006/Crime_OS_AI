# Legal Copilot Pipeline

This repository provides a production-style legal RAG pipeline for:

- BNS
- BNSS
- BSA

It is built for police-facing legal assistance, not open-ended chatbot use.

## Pipeline

```text
Complaint
→ OCR / Parsing
→ Embedding
→ Qdrant
→ Retrieval
→ Reranking
→ Local Qwen reasoning
```

## Current Parsing Flow

Legal acts now use a streaming OCR-block parser.

- OCR pages are processed in order
- The parser works on OCR blocks, not reconstructed page text
- Sections are detected from the block stream
- Page boundaries do not close sections
- Section output is written incrementally to JSONL as soon as a section is finalized
- After parsing completes, the JSONL file is converted to the final JSON output

This means parsed legal output is available during processing, not only at the end.

### Output Location

If you run the parser with:

```bash
python LEGAL_AGENT.py path\to\BNS.pdf --out parsed
```

then the parser writes:

- `parsed/BNS.jsonl`
- `parsed/BNS.json`

## Legal Record Shape

The current `LegalSectionRecord` stores:

- `id`
- `document_type`
- `act`
- `serial_number`
- `chapter`
- `chapter_tag`
- `content`
- `summary`
- `references`
- `page_numbers`
- `metadata`

Redundant section-level fields such as `clauses`, `subsections`, `page`, `source_page`, and `source_pages` have been removed from the legal section record.

## OCR Cleanup

The legal parser removes common OCR noise patterns, including:

- `THE GAZETTE OF INDIA EXTRAORDINARY`
- lines starting with `[Part ...`
- `Sec. <number>]`
- separator-only lines made of underscores
- `<number> of <year>.`

## Embedding Model

- `BAAI/bge-m3`
- Local inference only
- `sentence-transformers`
- Each legal section now produces 3 embeddings:
  - `content_embedding`
  - `summary_embedding`
  - `chapter_tag_embedding`
- Each embedding row carries its own `uuid` for Qdrant storage

## Reranker

- `BAAI/bge-reranker-v2-m3`
- Local inference only

## Vector Store

- Qdrant Local
- Single collection: `legal`
- Search results are deduped back to one result per section
- Run locally with:

```bash
docker run -p 6333:6333 qdrant/qdrant
```

## Key Commands

Generate embeddings from parsed JSON:

```bash
python -m ingestion.embed_records parsed/BNS.json --out embedded/legal_embeddings.jsonl
```

This writes 3 JSONL rows per section, one for each embedding type.

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

The terminal flow prints:

- Top 20 retrieved sections
- Top 5 reranked sections
- Reference-expanded sections
- Confidence score and level
- Final structured legal analysis JSON

## Notes

- Chapter metadata and chapter tags are carried into embeddings.
- The section parser payload still uses the parsed section `id`, but Qdrant point ids now use embedding UUIDs.
- Reference expansion is one level deep only.
