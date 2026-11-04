"""Application settings loaded from environment variables."""
from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parents[3] / ".env"
PROJECT_ROOT = ENV_FILE.parent


def _normalize_sqlite_url(url: str) -> str:
    prefixes = ("sqlite+aiosqlite:///", "sqlite:///")
    for prefix in prefixes:
        if not url.startswith(prefix):
            continue

        raw_path = url[len(prefix):]
        if raw_path.startswith(("/", "\\")) or ":/" in raw_path or ":\\" in raw_path:
            return url

        absolute_path = (PROJECT_ROOT / raw_path).resolve().as_posix()
        return f"{prefix}{absolute_path}"

    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ──────────────────────────────────────────────────────────────────
    app_name: str = "Complaints MIS"
    app_version: str = "0.1.0"
    app_env: str = "development"
    sql_echo: bool = False

    # ── Database ─────────────────────────────────────────────────────────────
    database_url: str = (
        "postgresql+asyncpg://complaints:your_postgres_password_here@localhost:5432/complaints_db"
    )
    sync_database_url: str = (
        "postgresql+psycopg2://complaints:your_postgres_password_here@localhost:5432/complaints_db"
    )

    # ── Auth ─────────────────────────────────────────────────────────────────
    secret_key: str = "your_64_char_hex_secret_here"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # ── CORS ─────────────────────────────────────────────────────────────────
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    # ── AI / RAG ─────────────────────────────────────────────────────────────
    ai_enabled: bool = False
    openai_api_key: str = ""
    openai_vector_store_id: str = ""          # Cloud KB — OpenAI Vector Store
    openai_assistant_id: str = ""             # Pre-created assistant (created at runtime if empty)
    kb_provider: str = "openai"               # "openai" | "local"
    kb_local_indexing_enabled: bool = False    # gate for local chunk pipeline
    llm_provider: str = "openai"
    embeddings_provider: str = "openai"
    llm_model: str = "gpt-4o-mini"
    embeddings_model: str = "text-embedding-3-small"
    rag_sim_threshold: float = 0.50
    rag_top_k: int = 6

    @property
    def is_ai_active(self) -> bool:
        """True only if visibly enabled AND the key is successfully populated."""
        return self.ai_enabled and bool(self.openai_api_key and self.openai_api_key.strip())

    @property
    def cloud_kb_enabled(self) -> bool:
        """True when provider==openai AND a Vector Store ID + key are present."""
        return (
            self.kb_provider == "openai"
            and self.is_ai_active
            and bool(self.openai_vector_store_id and self.openai_vector_store_id.strip())
        )

    @model_validator(mode="after")
    def normalize_database_urls(self):
        self.database_url = _normalize_sqlite_url(self.database_url)
        self.sync_database_url = _normalize_sqlite_url(self.sync_database_url)
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
