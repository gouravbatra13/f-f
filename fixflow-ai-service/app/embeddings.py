from __future__ import annotations

import math
from threading import Lock
from typing import Protocol

import httpx
import numpy as np


class Encoder(Protocol):
    def encode(self, texts: list[str]) -> list[list[float]]: ...


class SentenceTransformerEncoder:
    def __init__(self, model_name: str, device: str = "cpu") -> None:
        self.model_name = model_name
        self.device = device
        self._model = None
        self._lock = Lock()

    def encode(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        with self._lock:
            if self._model is None:
                try:
                    from sentence_transformers import SentenceTransformer
                except ImportError as exc:
                    raise RuntimeError(
                        "Sentence Transformers is unavailable; install the AI service dependencies "
                        "in a supported Python 3.11–3.13 environment."
                    ) from exc
                self._model = SentenceTransformer(
                    self.model_name,
                    device=self.device,
                    local_files_only=False,
                )
            vectors = self._model.encode(
                texts,
                normalize_embeddings=True,
                convert_to_numpy=True,
                show_progress_bar=False,
            )
        return np.asarray(vectors, dtype=np.float32).tolist()


class OllamaEmbeddingEncoder:
    def __init__(
        self, base_url: str, model_name: str, timeout_seconds: float = 90
    ) -> None:
        self.url = f"{base_url.rstrip('/')}/api/embed"
        self.model_name = model_name
        self.timeout_seconds = timeout_seconds
        self._lock = Lock()

    def encode(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        embeddings: list[list[float]] = []
        with self._lock:
            try:
                with httpx.Client(timeout=self.timeout_seconds, trust_env=False) as client:
                    for start in range(0, len(texts), 32):
                        response = client.post(
                            self.url,
                            json={
                                "model": self.model_name,
                                "input": texts[start : start + 32],
                            },
                        )
                        response.raise_for_status()
                        payload = response.json()
                        batch = payload.get("embeddings")
                        if (
                            not isinstance(batch, list)
                            or len(batch) != len(texts[start : start + 32])
                            or any(not isinstance(vector, list) for vector in batch)
                        ):
                            raise ValueError("Invalid embedding response")
                        for vector in batch:
                            if not vector or any(
                                not isinstance(value, (int, float))
                                or not math.isfinite(value)
                                for value in vector
                            ):
                                raise ValueError("Invalid embedding vector")
                            embeddings.append([float(value) for value in vector])
            except (httpx.HTTPError, ValueError, TypeError, KeyError) as exc:
                raise RuntimeError(
                    "Ollama embedding request failed or returned invalid data"
                ) from exc
        dimensions = {len(vector) for vector in embeddings}
        if len(embeddings) != len(texts) or len(dimensions) != 1:
            raise RuntimeError("Ollama returned inconsistent embedding dimensions")
        return embeddings


def create_encoder(
    provider: str,
    model_name: str,
    device: str,
    ollama_url: str,
    timeout_seconds: float,
) -> Encoder:
    if provider == "sentence-transformers":
        return SentenceTransformerEncoder(model_name, device)
    if provider == "ollama":
        return OllamaEmbeddingEncoder(ollama_url, model_name, timeout_seconds)
    raise ValueError("AI_EMBEDDING_PROVIDER must be ollama or sentence-transformers")
