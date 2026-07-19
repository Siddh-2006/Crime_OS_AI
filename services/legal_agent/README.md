# Legal Copilot Pipeline

This repository provides a retrieval and reasoning pipeline for:

- BNS
- BNSS
- BSA
- Dept Registry documents
- SOP documents

It is designed for legal and police-facing assistance, not free-form chat.

## Current Pipeline

```text
Query
  -> BM25 Search
  -> Vector Search
  -> Weighted RRF Fusion
  -> Reranking
  -> Top 5 Context
  -> Local Qwen reasoning
```

The system currently supports a shared Qdrant collection for all document types.
The `act` field is used to distinguish document families.

## Supported Record Types

- `LegalSectionRecord`
- `DeptRegistryRecord`
- `SOPRecord`

## Parsing

Legal acts still use the OCR-block-driven parser.

Important behavior:

- OCR is processed in block order
- Parsing works on OCR blocks, not reconstructed full-page text
- Sections are detected from the block stream
- Page boundaries do not close sections
- Sections are written incrementally to JSONL as soon as they finalize
- JSON is produced after JSONL finalization

Dept Registry and SOP documents are already parsed and available under `parsed/`.

## Current Record Shapes

### LegalSectionRecord

Key fields currently used:

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

### DeptRegistryRecord

Key fields currently used:

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

### SOPRecord

Key fields currently used:

- `act`
- `sop_id`
- `crime_type`
- `title`
- `source`
- `steps`
- `dead_end_strategies`

## Embedding

Embedding now supports mixed parsed document types.

Default input auto-detects record type:

```bash
python -m ingestion.embed_records parsed --out embedded/all_embeddings.jsonl
```

You can also force a specific record type:

```bash
python -m ingestion.embed_records parsed/BNS.json --type legal --out embedded/BNS_embeddings.jsonl
python -m ingestion.embed_records parsed/Department_Registry.json --type dept --out embedded/Department_Registry_embeddings.jsonl
python -m ingestion.embed_records parsed/SOP2.json --type sop --out embedded/SOP2_embeddings.jsonl
```

Embedding text is schema-aware:

- Legal sections use `act`, `chapter`, `serial_number`, and `content`
- Dept Registry uses the service and escalation fields relevant to requests
- SOP uses `crime_type`, `title`, step details, and dead-end strategy text

## Qdrant

Default Qdrant settings:

- URL: `http://localhost:6333`
- Collection: `final`

Run Qdrant locally:

```bash
docker run -p 6333:6333 qdrant/qdrant
```

Upload embeddings into the default collection:

```bash
python -m ingestion.ingest_qdrant embedded/all_embeddings.jsonl
```

Override the collection if needed:

```bash
python -m ingestion.ingest_qdrant embedded/all_embeddings.jsonl --collection final
```
# Reranker
- On the first time importing the code run export_weights.py which creates onnx_reranker for caching of reranker

## Retrieval

Retrieval currently combines:

- BM25 search over schema-specific text
- Qdrant vector search
- Weighted Reciprocal Rank Fusion
- ONNX-based reranking

BM25 fields:

- Legal sections: `chapter_tag`, `summary`, `content`
- Dept Registry:
  - `entity_name`
  - `category`
  - `what_they_can_provide`
  - `legal_basis_typically_cited`
  - `request_format_expected`
  - `typical_response_time`
  - `escalation_path_if_no_response`
  - `notes_or_caveats`
- SOP:
  - boosted `crime_type`
  - boosted `title`
  - flattened step fields
  - dead-end strategy fields

Fusion weights:

- BM25: `0.4`
- Vector: `0.6`

Default retrieval output sizes:

- Top fused candidates: `15`
- Top reranked sections: `5`

## Commands

### 1. Evaluate retrieval for one query

```bash
python scripts/evaluate_retrieval.py "A man riding a bike snatched a woman's mobile phone from her hand and fled."
```

Optional arguments:

- `--top-k N`
  - number of fused candidates passed to reranking
- `--final-k N`
  - number of reranked results returned
- `--act ACT`
  - repeatable filter for one or more acts
- `--interactive`
  - keeps one Python process alive and accepts repeated queries until `exit`

Examples:

```bash
python scripts/evaluate_retrieval.py "Your query here" --top-k 15 --final-k 5
python scripts/evaluate_retrieval.py "Your query here" --act BNS --act BNSS
python scripts/evaluate_retrieval.py --interactive --top-k 15 --final-k 5
```

Interactive mode:

```text
query> first query
query> second query
query> exit
```

### 2. Run the full copilot pipeline

```bash
python scripts/run_legal_copilot.py "A man riding a bike snatched a woman's mobile phone from her hand and fled."
```

Optional arguments:

- `--top-k N`
- `--final-k N`
- `--device cpu|cuda`
- `--model MODEL_NAME_OR_PATH`
- `--act ACT`

Examples:

```bash
python scripts/run_legal_copilot.py "Your query here" --top-k 15 --final-k 5
python scripts/run_legal_copilot.py "Your query here" --act BNS --act SOP
python scripts/run_legal_copilot.py "Your query here" --device cpu --model Qwen/Qwen3-8B
```

## Timing Logs

The retrieval path prints timing logs to stderr for:

- retriever initialization
- BM25 document load
- BM25 index build
- BM25 search
- query embedding
- Qdrant vector search
- fusion
- reranking
- reference expansion
- total retrieval time

This is useful for checking whether the process is spending time in:

- model loading
- embedding
- Qdrant scroll/search
- reranking

## Current Notes

- Models are currently loaded lazily and cached within a running Python process.
- If you rerun the script as a fresh process, the models will load again.
- Reference expansion currently uses exact `act` + `serial_number` lookups.
- Only the final top 5 reranked sections are sent to the LLM.


