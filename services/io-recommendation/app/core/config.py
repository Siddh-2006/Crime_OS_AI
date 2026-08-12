from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    """
    Central configuration loaded from environment variables / .env file.
    Uses pydantic-settings for type-safe env parsing.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ── Application ─────────────────────────────────────────────────────────────
    APP_NAME: str = "Crime OS AI Recommendation Service"
    APP_VERSION: str = "1.0.0"
    LOG_LEVEL: str = "INFO"

    # ── Qdrant Vector Database ──────────────────────────────────────────────────
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_API_KEY: Optional[str] = None        # Set for Qdrant Cloud; leave empty for local
    QDRANT_COLLECTION: str = "crime_fir_embeddings"
    EMBEDDING_DIM: int = 768          # nomic-embed-text-v2-moe output dimension

    # ── llama.cpp Embedding Server ──────────────────────────────────────────────
    LLAMA_CPP_URL: str = "http://localhost:8080"    # llama-server endpoint
    EMBEDDING_MODEL: str = "nomic-embed-text-v2-moe"
    EMBEDDING_TIMEOUT_SECONDS: int = 60

    # ── Recommendation Hyper-parameters ─────────────────────────────────────────
    TOP_K_SIMILAR: int = 50           # how many nearest neighbours to retrieve
    SIMILARITY_THRESHOLD: float = 0.6 # minimum cosine similarity (0-1) to consider a case relevant


settings = Settings()
