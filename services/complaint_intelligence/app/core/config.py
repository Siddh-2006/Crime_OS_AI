"""
Central configuration.
Loaded from environment variables / .env file via pydantic-settings.
All fields are validated at startup — the application will not start
if a required variable is missing or has the wrong type.
"""
from __future__ import annotations

from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_SERVICE_DIR = Path(__file__).resolve().parent.parent.parent
_REPO_ROOT = _SERVICE_DIR.parent.parent
_ENV_FILE = _SERVICE_DIR / ".env"
_BACKEND_ENV_FILE = _REPO_ROOT / "backend" / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(_BACKEND_ENV_FILE), str(_ENV_FILE), ".env"),
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

    # ── MongoDB ───────────────────────────────────────────────────────────────
    MONGODB_URI: str = "mongodb://localhost:27017/crime_os"
    MONGODB_DB: str = "crime_os"

    # ── Logging ───────────────────────────────────────────────────────────────
    LOG_LEVEL: str = Field(default="INFO", pattern="^(DEBUG|INFO|WARNING|ERROR|CRITICAL)$")
    LOG_FORMAT: str = "json"  # "json" | "text"

    # ── LLM (Ollama primary, Gemini fallback) ───────────────────────────────
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "gemma4:e2b"
    CASE_UNDERSTANDING_MODEL: str = "gemma4:e2b"
    OLLAMA_TIMEOUT_SECONDS: int = 600
    OLLAMA_NUM_CTX: int = 4096
    LLM_MAX_RETRIES: int = 3

    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.5-flash-lite"

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

    # ── Whisper (Audio AI) ────────────────────────────────────────────────
    WHISPER_MODEL: str = "tiny"           # tiny | base | small | medium | large-v3
    WHISPER_DEVICE: str = "cpu"           # cpu | cuda
    WHISPER_COMPUTE_TYPE: str = "int8"    # int8 | float16 | float32

    # ── Video Worker ────────────────────────────────────────────────
    VIDEO_SCENE_THRESHOLD: float = 27.0   # PySceneDetect ContentDetector threshold
    VIDEO_KEYFRAMES_PER_SCENE: int = 3    # keyframes per scene: 1 (middle) or 3 (start/middle/end)

    # ── PDF Worker ────────────────────────────────────────────────
    PDF_DIGITAL_CHAR_THRESHOLD: int = 20  # min non-whitespace chars to classify page as digital
    PDF_PAGE_RENDER_DPI: int = 150        # DPI for rendering scanned pages to JPEG

    # ── Secure Evidence Upload ────────────────────────────────────────────────
    EVIDENCE_UPLOAD_BASE_URL: str = "http://localhost:8001"
    # Public-facing base URL (e.g. https://crimeos.example.com in production)
    # Used to build upload URLs embedded in QR codes and emails.
    # Must NOT end with a trailing slash.

    UPLOAD_TOKEN_EXPIRY_DAYS: int = 0
    # 0 = permanent (tokens never expire while case is active).
    # Set to a positive integer to auto-expire tokens after N days.

    EVIDENCE_MAX_FILE_SIZE_MB: int = 50
    # Maximum accepted file size per upload in megabytes.

    # ── Cloudinary ────────────────────────────────────────────────────────────
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    CLOUDINARY_FOLDER: str = "crime-os/evidence"

    @property
    def redis_url(self) -> str:
        if self.REDIS_PASSWORD:
            return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"


settings = Settings()
