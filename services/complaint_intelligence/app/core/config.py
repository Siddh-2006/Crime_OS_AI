"""
Central configuration.
Loaded from environment variables / .env file via pydantic-settings.
All fields are validated at startup — the application will not start
if a required variable is missing or has the wrong type.
"""
from __future__ import annotations

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ───────────────────────────────────────────────────────────
    APP_NAME: str = "Crime OS Complaint Intelligence"
    APP_VERSION: str = "1.0.0"
    APP_ENV: str = Field(default="development", pattern="^(development|staging|production)$")
    DEBUG: bool = False

    # ── HTTP Server ───────────────────────────────────────────────────────────
    HOST: str = "0.0.0.0"
    PORT: int = Field(default=8001, ge=1, le=65535)

    # ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = Field(default=6379, ge=1, le=65535)
    REDIS_PASSWORD: str = ""
    REDIS_DB: int = Field(default=0, ge=0, le=15)

    # ── Logging ───────────────────────────────────────────────────────────────
    LOG_LEVEL: str = Field(default="INFO", pattern="^(DEBUG|INFO|WARNING|ERROR|CRITICAL)$")
    LOG_FORMAT: str = "json"  # "json" | "text"

    # ── LLM (Ollama) ──────────────────────────────────────────────────────────
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "gemma4:e2b"
    OLLAMA_TIMEOUT_SECONDS: int = 120
    OLLAMA_NUM_CTX: int = 4096

    # ── Queue ─────────────────────────────────────────────────────────────────
    QUEUE_MAX_JOBS: int = 10          # arq worker concurrency
    QUEUE_JOB_TIMEOUT: int = 300      # seconds before a job is considered stuck
    QUEUE_MAX_TRIES: int = 3

    # ── Workers ───────────────────────────────────────────────────────────────
    WORKER_HEALTH_CHECK_INTERVAL: int = 30   # seconds

    # ── Florence-2 (Image AI) ────────────────────────────────────────────
    FLORENCE_BASE_URL: str = "http://localhost:8002"
    FLORENCE_TIMEOUT_SECONDS: int = 60
    FLORENCE_MAX_IMAGE_DIM: int = 1024    # longest edge limit before Florence inference

    @property
    def redis_url(self) -> str:
        if self.REDIS_PASSWORD:
            return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"


settings = Settings()
