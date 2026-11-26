from __future__ import annotations

import hashlib
from dataclasses import dataclass
from threading import Lock
from typing import Any

import chromadb

from app.embeddings import Encoder
from app.redaction import redact_text
from app.schemas import KnowledgeDocument


@dataclass(frozen=True)
class SearchHit:
    source_id: str
    source_type: str
    title: str
    status: str | None
    severity: str | None
    similarity: float
    explanation: str


def chunk_text(text: str, size: int = 1200, overlap: int = 150) -> list[str]:
    cleaned = redact_text(text).strip()
    if not cleaned:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(cleaned):
        end = min(start + size, len(cleaned))
        if end < len(cleaned):
            boundary = cleaned.rfind(" ", start + size // 2, end)
            if boundary > start:
                end = boundary
        chunk = cleaned[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(cleaned):
            break
        start = max(start + 1, end - overlap)
    return chunks


class ChromaKnowledgeStore:
    def __init__(self, path: str, encoder: Encoder) -> None:
        self._client = chromadb.PersistentClient(path=path)
        self._collection = self._client.get_or_create_collection(
            name="fixflow_knowledge",
            metadata={"hnsw:space": "cosine"},
        )
        self._encoder = encoder
        self._lock = Lock()

    def index(
        self,
        organization_id: str,
        project_id: str | None,
        documents: list[KnowledgeDocument],
        replace_scope: bool = True,
    ) -> int:
        ids: list[str] = []
        texts: list[str] = []
        metadatas: list[dict[str, Any]] = []
        seen_documents: set[str] = set()
        for document in documents:
            safe_title = redact_text(document.title).strip()
            safe_content = redact_text(document.content).strip()
            if not safe_title or not safe_content:
                continue
            doc_key = f"{document.source_type}:{document.source_id}"
            seen_documents.add(doc_key)
            for ordinal, chunk in enumerate(
                chunk_text(f"{safe_title}\n{safe_content}")
            ):
                digest = hashlib.sha256(
                    f"{organization_id}:{doc_key}:{ordinal}".encode()
                ).hexdigest()
                ids.append(digest)
                texts.append(chunk)
                metadatas.append(
                    {
                        "organization_id": organization_id,
                        "project_id": document.project_id or "__organization__",
                        "source_id": document.source_id,
                        "source_type": document.source_type,
                        "title": safe_title[:512],
                        "status": document.status or "",
                        "severity": document.severity or "",
                        "updated_at": document.updated_at or "",
                        "chunk_ordinal": ordinal,
                    }
                )

        with self._lock:
            if replace_scope:
                scope = {"organization_id": organization_id}
                if project_id:
                    scope = {
                        "$and": [
                            {"organization_id": organization_id},
                            {
                                "$or": [
                                    {"project_id": project_id},
                                    {"project_id": "__organization__"},
                                ]
                            },
                        ]
                    }
                self._collection.delete(where=scope)
            else:
                for document in documents:
                    self._collection.delete(
                        where={
                            "$and": [
                                {"organization_id": organization_id},
                                {"source_id": document.source_id},
                                {"source_type": document.source_type},
                            ]
                        }
                    )
            if ids:
                embeddings = self._encoder.encode(texts)
                self._collection.upsert(
                    ids=ids,
                    documents=texts,
                    metadatas=metadatas,
                    embeddings=embeddings,
                )
        return len(seen_documents)

    def search(
        self,
        organization_id: str,
        project_id: str | None,
        query: str,
        similarity_threshold: float,
        limit: int,
    ) -> list[SearchHit]:
        safe_query = redact_text(query).strip()
        if not safe_query:
            return []
        where: dict[str, Any] = {"organization_id": organization_id}
        if project_id:
            where = {
                "$and": [
                    {"organization_id": organization_id},
                    {
                        "$or": [
                            {"project_id": project_id},
                            {"project_id": "__organization__"},
                        ]
                    },
                ]
            }
        with self._lock:
            if self._collection.count() == 0:
                return []
            vectors = self._encoder.encode([safe_query])
            result = self._collection.query(
                query_embeddings=vectors,
                where=where,
                n_results=limit,
                include=["metadatas", "distances", "documents"],
            )
        hits: list[SearchHit] = []
        best_by_source: dict[tuple[str, str], SearchHit] = {}
        metadatas = result.get("metadatas") or [[]]
        distances = result.get("distances") or [[]]
        docs = result.get("documents") or [[]]
        for metadata, distance, chunk in zip(
            metadatas[0], distances[0], docs[0], strict=False
        ):
            similarity = max(0.0, min(1.0, 1.0 - float(distance)))
            if similarity < similarity_threshold:
                continue
            source_id = str(metadata.get("source_id", ""))
            source_type = str(metadata.get("source_type", ""))
            if not source_id:
                continue
            candidate = SearchHit(
                source_id=source_id,
                source_type=source_type,
                title=str(metadata.get("title", "")),
                status=metadata.get("status") or None,
                severity=metadata.get("severity") or None,
                similarity=round(similarity, 4),
                explanation=redact_text(str(chunk))[:500],
            )
            key = (source_type, source_id)
            if key not in best_by_source or similarity > best_by_source[key].similarity:
                best_by_source[key] = candidate
        hits.extend(best_by_source.values())
        return sorted(hits, key=lambda hit: hit.similarity, reverse=True)[:limit]

    def remove_document(
        self, organization_id: str, source_id: str, source_type: str
    ) -> int:
        with self._lock:
            filters = {
                "$and": [
                    {"organization_id": organization_id},
                    {"source_id": source_id},
                    {"source_type": source_type},
                ]
            }
            before = len(
                self._collection.get(where=filters, include=[])["ids"]
            )
            self._collection.delete(
                where=filters
            )
        return before
