from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _secret(name: str) -> str:
    secret_file = os.getenv(f"{name}_FILE")
    if secret_file:
        value = Path(secret_file).read_text(encoding="utf-8")
        value = value.removesuffix("\r\n").removesuffix("\n")
        if not value:
            raise ValueError(f"{name}_FILE must point to a non-empty secret file")
        return value
    return os.getenv(name, "")


@dataclass(frozen=True)
class Settings:
    service_token: str
    chroma_path: Path
    embedding_model: str
    embedding_device: str
    ollama_url: str
    ollama_model: str
    ollama_timeout_seconds: float
    max_documents_per_request: int
    embedding_provider: str = "sentence-transformers"
    metrics_token: str = ""

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            service_token=_secret("AI_SERVICE_TOKEN"),
            chroma_path=Path(os.getenv("AI_CHROMA_PATH", "./data/chroma")).resolve(),
            embedding_model=os.getenv(
                "AI_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"
            ),
            embedding_device=os.getenv("AI_EMBEDDING_DEVICE", "cpu"),
            ollama_url=os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip(
                "/"
            ),
            ollama_model=os.getenv("OLLAMA_MODEL", "deepseek-coder:latest"),
            ollama_timeout_seconds=float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "90")),
            max_documents_per_request=int(os.getenv("AI_MAX_DOCUMENTS", "300")),
            embedding_provider=os.getenv(
                "AI_EMBEDDING_PROVIDER", "sentence-transformers"
            ).strip().lower(),
            metrics_token=_secret("METRICS_TOKEN"),
        )
