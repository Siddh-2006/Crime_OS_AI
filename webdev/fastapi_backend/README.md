.\llama-cli -m .\nomic-embed-text-v2-moe.Q4_K_M.gguf
To start the server
.\llama-server -m .\nomic-embed-text-v2-moe.Q4_K_M.gguf --embedding --port 8080


# Crime OS — AI IO Recommendation Microservice

A production-grade FastAPI microservice that provides **semantic Investigation Officer (IO) recommendations** for the Crime OS Gujarat Police platform.

---

## Architecture

```
Node.js Backend  ──► POST /embed-case        ──► Qdrant (store closed FIR vectors)
Node.js Backend  ──► POST /recommend-officers ──► Qdrant (query) ──► AI scores returned
                                                       ▲
                                              nomic-embed-text-v2-moe
                                              (served by llama.cpp)
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Python 3.12 |
| API Framework | FastAPI + Uvicorn |
| Schema Validation | Pydantic v2 |
| Vector Database | Qdrant |
| Embedding Model | `nomic-embed-text-v2-moe` GGUF via llama.cpp |
| HTTP Client | httpx (async) |
| Config | pydantic-settings |

---

## Project Structure

```
fastapi_backend/
├── app/
│   ├── main.py                        # FastAPI app, lifespan, router registration
│   ├── core/
│   │   ├── config.py                  # Typed settings (pydantic-settings)
│   │   └── logging.py                 # JSON structured logger
│   ├── api/
│   │   ├── dependencies.py            # DI — service instances
│   │   └── routes/
│   │       ├── embed.py               # POST /embed-case
│   │       └── recommend.py           # POST /recommend-officers
│   ├── schemas/
│   │   ├── fir.py                     # EmbedCaseRequest / Response
│   │   ├── complaint.py               # RecommendOfficersRequest
│   │   └── recommendation.py          # OfficerRecommendation / Response
│   ├── services/
│   │   ├── embed_service.py           # Embed pipeline orchestration
│   │   └── recommendation_service.py  # Recommendation pipeline + weighted voting
│   ├── repositories/
│   │   └── qdrant_repository.py       # All Qdrant I/O (upsert + search)
│   ├── vector/
│   │   ├── qdrant/client.py           # Qdrant async client singleton
│   │   └── embeddings/embedder.py     # llama.cpp embedder (doc/query prefixes)
│   └── utils/
│       └── text_normalizer.py         # FIR/complaint → structured text
├── requirements.txt
├── Dockerfile
└── .env.example
```

---

## Setup & Running

### Prerequisites

1. **Qdrant** — start via Docker:
   ```bash
   docker run -d -p 6333:6333 qdrant/qdrant:v1.9.1
   ```

2. **llama.cpp server** — run locally with the GGUF model:
   ```bash
   ./llama-server \
     --model nomic-embed-text-v2-moe-Q4_K_M.gguf \
     --port 8080 \
     --embedding \
     --pooling mean
   ```
   > Download the GGUF from Hugging Face: `nomic-ai/nomic-embed-text-v2-moe-GGUF`

### Install & Run

```bash
# 1. Create virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Linux/macOS

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
copy .env.example .env
# Edit .env — set QDRANT_URL and LLAMA_CPP_URL

# 4. Start the service
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The service auto-creates the Qdrant collection on startup.

### Docker Compose (full stack)

```bash
# From the webdev/ root directory
docker compose up qdrant ai_recommendation
```

---

## API Reference

### `POST /embed-case`

Called by the Node backend when a case is **CLOSED**. Idempotent — re-posting with the same `firId` updates the existing vector.

**Request body** (all optional fields except firId, complaintId, officerId, stationId, district, firNumber, crimeCategory, incidentSummary, location, createdAt):
```json
{
  "firId": "mongo-object-id",
  "complaintId": "mongo-object-id",
  "officerId": "io-officer-id",
  "stationId": "station-id",
  "district": "Ahmedabad",
  "firNumber": "GJ-AHM002-2026-0001",
  "crimeCategory": "THEFT",
  "incidentSummary": "A vehicle was stolen from a residential area...",
  "location": "Satellite, Ahmedabad, Gujarat",
  "createdAt": "2026-01-01T00:00:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "firId": "...",
  "message": "Case GJ-AHM002-2026-0001 successfully created in vector store.",
  "action": "created"
}
```

---

### `POST /recommend-officers`

Called by the Node backend when the SHO opens the Approve & Assign IO screen.

**Request body:**
```json
{
  "complaint": {
    "complaintId": "...",
    "stationId": "...",
    "category": "THEFT",
    "shortDescription": "Bike stolen from house",
    "detailedDescription": "...",
    "incidentPlace": "Satellite, Ahmedabad",
    "incidentDate": "2026-07-14T00:00:00Z"
  },
  "availableOfficers": [
    { "officerId": "io-1", "officerName": "Ramesh Patel", "badgeNumber": "GJ-IO-001" },
    { "officerId": "io-2", "officerName": "Sita Sharma", "badgeNumber": "GJ-IO-002" }
  ]
}
```

**Response:**
```json
{
  "recommendations": [
    {
      "officerId": "io-1",
      "score": 87.4,
      "matchedCases": 5,
      "averageSimilarity": 0.82,
      "reasons": [
        "Handled 5 semantically similar closed case(s) at this station.",
        "Average similarity of retrieved cases: 0.820.",
        "Most similar closed FIR similarity score: 0.914."
      ]
    }
  ],
  "totalCasesSearched": 23,
  "queryCategory": "THEFT"
}
```

---

### `GET /health`

Returns `{"status": "ok", "service": "...", "version": "1.0.0"}`.

---

## How the Recommendation Algorithm Works

1. **Text Normalisation** — Complaint fields (category, location, descriptions) are assembled into structured text.
2. **Query Embedding** — The text is prefixed with `search_query: ` and embedded via llama.cpp (nomic asymmetric model).
3. **Qdrant Search** — Top-50 cosine-similar closed FIR vectors are retrieved, filtered by the complaint's `stationId`.
4. **Weighted Voting** — For each result that belongs to an *available IO*, their cumulative similarity score is accumulated.
5. **Normalisation** — Scores are normalised to 0–100 relative to the highest-scoring officer.
6. **Sorted Response** — Officers are returned sorted by score descending. The Node backend merges names/badges from MongoDB.

---

## Node.js Integration Notes

| When | What happens |
|------|-------------|
| IO / SHO closes a case (`PATCH /complaints/:id/close`) | Node backend fires `POST /embed-case` (fire-and-forget) |
| SHO opens Approve & Assign page, fetches IOs | Node calls `POST /recommend-officers` and merges AI scores onto IO list |
| AI service is unavailable | Node backend degrades gracefully — returns plain IO list without AI scores |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `QDRANT_URL` | `http://localhost:6333` | Qdrant server URL |
| `QDRANT_COLLECTION` | `crime_fir_embeddings` | Collection name |
| `EMBEDDING_DIM` | `768` | Embedding dimension of the model |
| `LLAMA_CPP_URL` | `http://localhost:8080` | llama-server endpoint |
| `EMBEDDING_MODEL` | `nomic-embed-text-v2-moe` | Model name sent in API calls |
| `EMBEDDING_TIMEOUT_SECONDS` | `60` | HTTP timeout for embedding requests |
| `TOP_K_SIMILAR` | `50` | Number of nearest vectors to retrieve |
| `LOG_LEVEL` | `INFO` | Logging level |
