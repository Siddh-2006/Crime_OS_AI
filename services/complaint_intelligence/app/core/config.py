from pydantic_settings import BaseSettings, SettingsConfigDict


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
    APP_NAME: str = "Crime OS Complaint Intelligence Service"
    APP_VERSION: str = "1.0.0"
    LOG_LEVEL: str = "INFO"

    # API configuration
    HOST: str = "127.0.0.1"
    PORT: int = 8001


settings = Settings()
