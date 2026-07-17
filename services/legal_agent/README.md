# Legal Copilot Pipeline

This repository provides a production-style retrieval and reasoning pipeline for:

- BNS
- BNSS
- BSA
- Dept Registry
- SOP documents

It is built for police-facing legal assistance, not open-ended chatbot use.

## Pipeline

```text
Query
→ BM25 Search
→ Vector Search
→ Weighted RRF Fusion
→ Reranking
→ Top 5 Context
→ Local Qwen reasoning
```

## Supported Records

The system now works with a mixed Qdrant collection containing:

- `LegalSectionRecord`
- `DeptRegistryRecord`
- `SOPRecord`

The `act` field is used to distinguish document families inside the shared collection.

## Parsing Flow

Legal acts still use the streaming OCR-block parser.

- OCR pages are processed in order
- The parser works on OCR blocks, not reconstructed page text
- Sections are detected from the block stream
- Page boundaries do not close sections
- Section output is written incrementally to JSONL as soon as a section is finalized
- After parsing completes, the JSONL file is converted to the final JSON output

This means parsed legal output is available during processing, not only at the end.

## Output Location

If you run the parser with:

```bash
python LEGAL_AGENT.py path\to\BNS.pdf --out parsed
```

then the parser writes:

- `parsed/BNS.jsonl`
- `parsed/BNS.json`

Dept Registry and SOP documents are already parsed and stored under `parsed/`.

## Record Shapes

### Legal sections

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

### Dept Registry

The current `DeptRegistryRecord` stores:

- `act`
- `entity_id`
- `entity_name`
- `category`
- `what_they_can_provide`
- `legal_basis_typically_cited`
- `request_format_expected`
- `typical_response_time`
- `escalation_path_if_no_response`
- `notes_or_caveats`
- `confidence`

### SOP

The current `SOPRecord` stores:

- `act`
- `sop_id`
- `crime_type`
- `title`
- `source`
- `steps`
- `dead_end_strategies`

## Embedding

The embedder now supports mixed document types.

Generate embeddings from parsed JSON:

```bash
python -m ingestion.embed_records parsed --out embedded/legal_embeddings.jsonl
```

You can also force a specific schema if needed:

```bash
python -m ingestion.embed_records parsed/BNS.json --type legal --out embedded/BNS_embeddings.jsonl
python -m ingestion.embed_records parsed/Department_Registry.json --type dept --out embedded/Department_Registry_embeddings.jsonl
python -m ingestion.embed_records parsed/SOP2.json --type sop --out embedded/SOP2_embeddings.jsonl
```

The embedding text is schema-aware:

- Legal sections use `act`, `chapter`, `serial_number`, and `content`
- Dept Registry uses the operational fields relevant for service requests and escalation
- SOP uses the crime type, title, steps, and dead-end strategy text

## Vector Store

- Qdrant Local
- Single collection: `legal`
- Shared collection for all supported document types
- Run locally with:

```bash
docker run -p 6333:6333 qdrant/qdrant
```

Upload embeddings into Qdrant:

```bash
python -m ingestion.ingest_qdrant embedded/legal_embeddings.jsonl
```

## Retrieval

Retrieval now combines:

- BM25 search over schema-specific text
- Vector search over Qdrant embeddings
- Weighted Reciprocal Rank Fusion
- Existing reranker

BM25 fields:

- Legal sections: `chapter_tag`, `summary`, `content`
- Dept Registry: `entity_name`, `category`, `what_they_can_provide`, `legal_basis_typically_cited`, `request_format_expected`, `typical_response_time`, `escalation_path_if_no_response`, `notes_or_caveats`
- SOP: boosted `crime_type` and `title`, then flattened step and dead-end strategy fields

Fusion weights:

- BM25: `0.6`
- Vector: `0.4`

Top retrieved candidate count:

- `15`

Top reranked context sent to the LLM:

- `5`

## Key Commands

Evaluate retrieval quality:

```bash
python scripts/evaluate_retrieval.py "Victim lost ₹50,000 through a fake UPI collect request."
```

Run the full legal copilot pipeline:

```bash
python scripts/run_legal_copilot.py "Victim lost ₹50,000 through a fake UPI collect request."
```

Optional act filtering:

```bash
python scripts/evaluate_retrieval.py "Your query here" --act BNS --act sop
```

## Notes

- Chapter metadata and chapter tags are carried into legal embeddings.
- Reference expansion is one level deep only.
- Only the final top 5 reranked sections are passed to the LLM.
