from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.llm import InvalidModelResponse, OllamaClient, OllamaUnavailable
from app.embeddings import OllamaEmbeddingEncoder
from app.main import JsonLogFormatter, create_app
from app.schemas import AnalysisRequest, KnowledgeDocument
from app.settings import Settings
from app.vector_store import ChromaKnowledgeStore, chunk_text


class TestEncoder:
    def encode(self, texts: list[str]) -> list[list[float]]:
        vectors = []
        for text in texts:
            digest = hashlib.sha256(text.lower().encode()).digest()
            vectors.append([byte / 255 for byte in digest[:16]])
        return vectors


class AiServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.temp = tempfile.TemporaryDirectory()
        cls.path = Path(cls.temp.name)
        settings = Settings(
            service_token="test-service-token-with-enough-randomness",
            chroma_path=cls.path / "chroma",
            embedding_model="test-encoder",
            embedding_device="cpu",
            ollama_url="http://127.0.0.1:11434",
            ollama_model="test-model",
            ollama_timeout_seconds=1,
            max_documents_per_request=5,
            metrics_token="test-metrics-token",
        )
        cls.store = ChromaKnowledgeStore(
            str(settings.chroma_path), TestEncoder()
        )
        cls.ollama = OllamaClient(
            settings.ollama_url, settings.ollama_model, 1
        )
        cls.app = create_app(settings, cls.store, cls.ollama)
        cls.client = TestClient(cls.app)
        cls.headers = {"X-Service-Token": settings.service_token}

    @classmethod
    def tearDownClass(cls) -> None:
        cls.client.close()
        cls.store._client._system.stop()
        cls.temp.cleanup()

    def setUp(self) -> None:
        suffix = hashlib.sha256(self.id().encode()).hexdigest()[:12]
        self.org_id = f"org-{suffix}"
        self.project_id = f"project-{suffix}"

    def test_health_is_available_without_service_credentials(self) -> None:
        self.ollama.health = AsyncMock(return_value=False)
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "degraded")
        self.assertRegex(response.headers["x-request-id"], r"^[0-9a-f-]{36}$")

    def test_json_logs_redact_secrets_and_include_correlation_id(self) -> None:
        from app.main import request_id_context

        context_token = request_id_context.set("request-123")
        try:
            record = logging.LogRecord(
                "fixflow_ai",
                logging.INFO,
                __file__,
                1,
                "request failed password=hunter2",
                (),
                None,
            )
            rendered = JsonLogFormatter().format(record)
        finally:
            request_id_context.reset(context_token)

        self.assertIn('"requestId": "request-123"', rendered)
        self.assertNotIn("hunter2", rendered)

    def test_internal_routes_require_service_authentication(self) -> None:
        response = self.client.post(
            "/v1/knowledge/search",
            json={
                "organization_id": self.org_id,
                "query": "database timeout",
            },
        )
        self.assertEqual(response.status_code, 401)

    def test_metrics_require_a_bearer_token(self) -> None:
        unauthorized = self.client.get("/metrics")
        self.assertEqual(unauthorized.status_code, 401)
        response = self.client.get(
            "/metrics",
            headers={"Authorization": "Bearer test-metrics-token"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("fixflow_ai_http_requests_total", response.text)

    def test_index_search_and_tenant_isolation(self) -> None:
        response = self.client.post(
            "/v1/knowledge/index",
            headers=self.headers,
            json={
                "organization_id": self.org_id,
                "documents": [
                    {
                        "source_id": "issue-a",
                        "source_type": "issue",
                        "project_id": self.project_id,
                        "title": "Database connection timeout",
                        "content": "MySQL connection failed after the pool timed out",
                        "status": "open",
                        "severity": "high",
                    }
                ],
            },
        )
        self.assertEqual(response.status_code, 200)
        query = {
            "organization_id": self.org_id,
            "project_id": self.project_id,
            "query": "MySQL pool connection timeout failure",
            "similarity_threshold": 0,
        }
        results = self.client.post(
            "/v1/knowledge/search", headers=self.headers, json=query
        ).json()["results"]
        self.assertEqual([item["source_id"] for item in results], ["issue-a"])
        isolated = self.client.post(
            "/v1/knowledge/search",
            headers=self.headers,
            json={**query, "organization_id": f"{self.org_id}-other"},
        ).json()["results"]
        self.assertEqual(isolated, [])

    def test_sensitive_data_is_removed_before_indexing(self) -> None:
        self.client.post(
            "/v1/knowledge/index",
            headers=self.headers,
            json={
                "organization_id": self.org_id,
                "documents": [
                    {
                        "source_id": "issue-secret",
                        "source_type": "issue",
                        "title": "Failed request user@example.com",
                        "content": "password=hunter2 Bearer abcdefghijklmnop",
                    }
                ],
            },
        )
        hits = self.store.search(self.org_id, None, "password failure", 0, 5)
        self.assertTrue(hits)
        self.assertNotIn("hunter2", hits[0].explanation)
        self.assertNotIn("user@example.com", hits[0].title)

    def test_long_text_is_chunked_with_overlap(self) -> None:
        chunks = chunk_text(("line of diagnostic information " * 200))
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(item) <= 1200 for item in chunks))

    def test_ollama_embedding_encoder_batches_and_validates_vectors(self) -> None:
        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {"embeddings": [[0.1, 0.2], [0.3, 0.4]]}

        class FakeClient:
            def __init__(self, **_kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return None

            def post(self, url, json):
                self.asserted_url = url
                self.asserted_json = json
                return FakeResponse()

        with patch("app.embeddings.httpx.Client", FakeClient):
            vectors = OllamaEmbeddingEncoder(
                "http://127.0.0.1:11434", "nomic-embed-text"
            ).encode(["first", "second"])

        self.assertEqual(vectors, [[0.1, 0.2], [0.3, 0.4]])

    def test_empty_knowledge_search_returns_no_results(self) -> None:
        self.assertEqual(
            self.store.search(
                self.org_id, None, "no indexed documents", 0.45, 5
            ),
            [],
        )

    def test_payload_validation_rejects_unexpected_fields(self) -> None:
        response = self.client.post(
            "/v1/knowledge/search",
            headers=self.headers,
            json={
                "organization_id": "org-a",
                "query": "timeout",
                "access_token": "must-not-be-accepted",
            },
        )
        self.assertEqual(response.status_code, 422)

    def test_deleted_document_is_removed_from_vector_index(self) -> None:
        self.store.index(
            self.org_id,
            None,
            [
                KnowledgeDocument(
                    source_id="issue-old",
                    source_type="issue",
                    project_id="project-a",
                    title="Old database failure",
                    content="Database query timeout",
                )
            ],
        )
        response = self.client.delete(
            "/v1/knowledge/documents/issue/issue-old",
            headers=self.headers,
            params={"organization_id": self.org_id},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.store.search(self.org_id, None, "database query timeout", 0, 5),
            [],
        )

    def test_project_refresh_prunes_stale_documents_without_touching_other_projects(
        self,
    ) -> None:
        self.store.index(
            self.org_id,
            "project-a",
            [
                KnowledgeDocument(
                    source_id="issue-a",
                    source_type="issue",
                    project_id="project-a",
                    title="Database outage",
                    content="Database query timeout",
                )
            ],
        )
        self.store.index(
            self.org_id,
            "project-b",
            [
                KnowledgeDocument(
                    source_id="issue-b",
                    source_type="issue",
                    project_id="project-b",
                    title="Database outage",
                    content="Database query timeout",
                )
            ],
        )

        self.store.index(self.org_id, "project-a", [])

        self.assertEqual(
            self.store.search(self.org_id, "project-a", "database timeout", 0, 5),
            [],
        )
        self.assertEqual(
            [
                hit.source_id
                for hit in self.store.search(
                    self.org_id, "project-b", "database timeout", 0, 5
                )
            ],
            ["issue-b"],
        )

    def test_project_search_includes_organization_wide_incidents(self) -> None:
        self.store.index(
            self.org_id,
            "project-a",
            [
                KnowledgeDocument(
                    source_id="incident-org",
                    source_type="incident",
                    project_id=None,
                    title="Organization-wide database outage",
                    content="Database query timeout affected multiple projects",
                )
            ],
        )

        results = self.store.search(
            self.org_id, "project-a", "database query timeout", 0, 5
        )

        self.assertEqual([hit.source_id for hit in results], ["incident-org"])

    def test_ollama_unavailable_is_a_safe_service_error(self) -> None:
        self.ollama.analyze = AsyncMock(
            side_effect=OllamaUnavailable("Configured Ollama model was not found")
        )
        response = self.client.post(
            "/v1/analyze",
            headers=self.headers,
            json={
                "model_name": "test-model",
                "source_type": "issue",
                "source_id": "issue-a",
                "context": "Database timeout",
                "allowed_evidence_ids": ["issue-a"],
                "similar_issues": [],
            },
        )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error"]["code"], "AI_MODEL_UNAVAILABLE")

    def test_model_output_is_schema_validated_and_evidence_is_allowlisted(self) -> None:
        request = AnalysisRequest(
            model_name="test-model",
            source_type="issue",
            source_id="issue-a",
            context="A connection timed out",
            allowed_evidence_ids=["issue-a"],
            similar_issues=[],
        )
        content = {
            "incident_summary": "A database request timed out.",
            "probable_root_cause": "A pool timeout is a hypothesis.",
            "confidence": 0.3,
            "confidence_label": "low",
            "confidence_rationale": "Only one event is available.",
            "evidence_sufficiency": "limited",
            "evidence": [
                {"source_id": "issue-a", "statement": "Connection timed out."},
                {"source_id": "issue-secret", "statement": "Not authorized."},
            ],
            "potential_impact": "Requests may fail.",
            "debugging_steps": ["Inspect pool metrics."],
            "remediation_suggestions": ["Check connection limits."],
        }

        class FakeResponse:
            def json(self):
                return {"message": {"content": json.dumps(content)}}

            @property
            def is_error(self):
                return False

            @property
            def status_code(self):
                return 200

        class FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_):
                return None

            async def post(self, *_args, **_kwargs):
                return FakeResponse()

        with patch("app.llm.httpx.AsyncClient", return_value=FakeClient()):
            result = asyncio.run(self.ollama.analyze(request))

        self.assertEqual(result.model_name, "test-model")
        self.assertEqual(
            [item.source_id for item in result.evidence], ["issue-a"]
        )

    def test_invalid_ollama_json_is_rejected(self) -> None:
        request = AnalysisRequest(
            model_name="test-model",
            source_type="issue",
            source_id="issue-a",
            context="A connection timed out",
            allowed_evidence_ids=["issue-a"],
            similar_issues=[],
        )

        class FakeResponse:
            def json(self):
                return {"message": {"content": "not valid json"}}

            @property
            def is_error(self):
                return False

            @property
            def status_code(self):
                return 200

        class FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_):
                return None

            async def post(self, *_args, **_kwargs):
                return FakeResponse()

        with patch("app.llm.httpx.AsyncClient", return_value=FakeClient()):
            with self.assertRaises(InvalidModelResponse):
                asyncio.run(self.ollama.analyze(request))


if __name__ == "__main__":
    unittest.main()
