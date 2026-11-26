from __future__ import annotations

import hmac
import json
import logging
import re
import time
import uuid
from contextvars import ContextVar
from contextlib import asynccontextmanager
from threading import Lock
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    Counter,
    Histogram,
    generate_latest,
)

from app.embeddings import create_encoder
from app.llm import InvalidModelResponse, OllamaClient, OllamaUnavailable
from app.redaction import redact_text
from app.schemas import (
    AnalysisRequest,
    IndexRequest,
    KnowledgeSearchRequest,
)
from app.settings import Settings
from app.vector_store import ChromaKnowledgeStore

request_id_context: ContextVar[str] = ContextVar("request_id", default="-")


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "timestamp": time.strftime(
                "%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)
            ),
            "level": record.levelname.lower(),
            "logger": record.name,
            "message": redact_text(record.getMessage()),
            "requestId": request_id_context.get(),
        }
        for key in ("http_method", "route", "status_code", "duration_ms"):
            value = getattr(record, key, None)
            if value is not None:
                entry[key] = value
        return json.dumps(entry, ensure_ascii=False)


_log_handler = logging.StreamHandler()
_log_handler.setFormatter(JsonLogFormatter())
logging.basicConfig(level=logging.INFO, handlers=[_log_handler], force=True)
logger = logging.getLogger("fixflow_ai")
_request_id_pattern = re.compile(r"^[A-Za-z0-9._-]{1,128}$")


def create_app(
    settings: Settings | None = None,
    store: ChromaKnowledgeStore | None = None,
    ollama: OllamaClient | None = None,
) -> FastAPI:
    config = settings or Settings.from_env()
    knowledge = store
    knowledge_lock = Lock()
    metrics_registry = CollectorRegistry()
    request_count = Counter(
        "fixflow_ai_http_requests_total",
        "Completed AI service requests.",
        ["method", "route", "status_code"],
        registry=metrics_registry,
    )
    request_duration = Histogram(
        "fixflow_ai_http_request_duration_seconds",
        "AI service request duration in seconds.",
        ["method", "route", "status_code"],
        registry=metrics_registry,
    )
    llm = ollama or OllamaClient(
        config.ollama_url,
        config.ollama_model,
        config.ollama_timeout_seconds,
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        config.chroma_path.mkdir(parents=True, exist_ok=True)
        if knowledge is None:
            get_knowledge()
        yield

    def get_knowledge() -> ChromaKnowledgeStore:
        nonlocal knowledge
        if knowledge is None:
            with knowledge_lock:
                if knowledge is None:
                    knowledge = ChromaKnowledgeStore(
                        str(config.chroma_path),
                        create_encoder(
                            config.embedding_provider,
                            config.embedding_model,
                            config.embedding_device,
                            config.ollama_url,
                            config.ollama_timeout_seconds,
                        ),
                    )
        return knowledge

    application = FastAPI(
        title="FixFlow AI Service",
        version="1.0.0",
        docs_url=None,
        redoc_url=None,
        lifespan=lifespan,
    )
    application.state.settings = config
    application.state.knowledge = knowledge
    application.state.ollama = llm

    @application.middleware("http")
    async def limit_request_size(request: Request, call_next):
        supplied_id = request.headers.get("x-request-id", "")
        request_id = (
            supplied_id
            if _request_id_pattern.fullmatch(supplied_id)
            else str(uuid.uuid4())
        )
        context_token = request_id_context.set(request_id)
        started = time.perf_counter()
        content_length = request.headers.get("content-length")
        response: Response
        try:
            if (
                content_length
                and content_length.isdigit()
                and int(content_length) > 8_000_000
            ):
                response = JSONResponse(
                    status_code=413,
                    content={
                        "error": {
                            "code": "PAYLOAD_TOO_LARGE",
                            "message": "Request payload exceeds the 8 MB limit",
                        }
                    },
                )
            else:
                response = await call_next(request)

            route = getattr(request.scope.get("route"), "path", "unmatched")
            duration = time.perf_counter() - started
            labels = (request.method, route, str(response.status_code))
            request_count.labels(*labels).inc()
            request_duration.labels(*labels).observe(duration)
            response.headers["X-Request-ID"] = request_id
            logger.info(
                "http_request",
                extra={
                    "http_method": request.method,
                    "route": route,
                    "status_code": response.status_code,
                    "duration_ms": round(duration * 1000, 2),
                },
            )
            return response
        finally:
            request_id_context.reset(context_token)

    @application.exception_handler(OllamaUnavailable)
    async def ollama_unavailable(_: Request, exc: OllamaUnavailable):
        logger.warning("Ollama unavailable: %s", exc)
        return JSONResponse(
            status_code=503,
            content={
                "error": {
                    "code": "AI_MODEL_UNAVAILABLE",
                    "message": str(exc),
                }
            },
        )

    @application.exception_handler(InvalidModelResponse)
    async def invalid_model_response(_: Request, exc: InvalidModelResponse):
        logger.error("AI provider returned an invalid structured response")
        return JSONResponse(
            status_code=502,
            content={
                "error": {
                    "code": "AI_INVALID_RESPONSE",
                    "message": str(exc),
                }
            },
        )

    @application.exception_handler(RuntimeError)
    async def embedding_unavailable(_: Request, exc: RuntimeError):
        logger.warning("Embedding model unavailable: %s", exc)
        return JSONResponse(
            status_code=503,
            content={
                "error": {
                    "code": "AI_EMBEDDINGS_UNAVAILABLE",
                    "message": str(exc),
                }
            },
        )

    @application.exception_handler(Exception)
    async def unexpected_error(_: Request, exc: Exception):
        logger.error("AI service internal error: %s", type(exc).__name__)
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "AI_INTERNAL_ERROR",
                    "message": "The AI service could not complete the request",
                }
            },
        )

    async def require_service_token(
        supplied: Annotated[str | None, Header(alias="X-Service-Token")] = None,
    ) -> None:
        expected = config.service_token
        if (
            len(expected.encode("utf-8")) < 32
            or not supplied
            or not hmac.compare_digest(supplied, expected)
        ):
            raise HTTPException(
                status_code=401,
                detail={
                    "code": "UNAUTHORIZED",
                    "message": "Valid service authentication is required",
                },
            )

    service_auth = Depends(require_service_token)

    @application.get("/health")
    async def health():
        model_available = await llm.health()
        return {
            "status": "ok" if model_available else "degraded",
            "service": "fixflow-ai",
            "ollama_model_available": model_available,
        }

    @application.get("/metrics", include_in_schema=False)
    async def metrics(
        authorization: Annotated[str | None, Header()] = None,
    ) -> Response:
        if not config.metrics_token:
            raise HTTPException(status_code=404, detail="Not found")
        supplied = (
            authorization.removeprefix("Bearer ")
            if authorization and authorization.startswith("Bearer ")
            else ""
        )
        if not hmac.compare_digest(
            supplied.encode("utf-8"), config.metrics_token.encode("utf-8")
        ):
            raise HTTPException(status_code=401, detail="Metrics authentication required")
        return Response(
            content=generate_latest(metrics_registry),
            media_type=CONTENT_TYPE_LATEST,
        )

    @application.post("/v1/knowledge/index", dependencies=[service_auth])
    async def index_knowledge(payload: IndexRequest):
        if len(payload.documents) > config.max_documents_per_request:
            raise HTTPException(
                status_code=413,
                detail="Too many knowledge documents in one request",
            )
        count = get_knowledge().index(
            payload.organization_id,
            payload.project_id,
            payload.documents,
            payload.replace_scope,
        )
        return {"indexed_documents": count}

    @application.delete(
        "/v1/knowledge/documents/{source_type}/{source_id}",
        dependencies=[service_auth],
    )
    async def delete_knowledge_document(
        source_type: str,
        source_id: str,
        organization_id: Annotated[str, Query(min_length=1, max_length=36)],
    ):
        if source_type not in {"issue", "incident", "deployment"}:
            raise HTTPException(status_code=422, detail="Invalid source type")
        count = get_knowledge().remove_document(
            organization_id, source_id, source_type
        )
        return {"removed_chunks": count}

    @application.post("/v1/knowledge/search", dependencies=[service_auth])
    async def search_knowledge(payload: KnowledgeSearchRequest):
        results = get_knowledge().search(
            payload.organization_id,
            payload.project_id,
            payload.query,
            payload.similarity_threshold,
            payload.limit,
        )
        return {"results": [result.__dict__ for result in results]}

    @application.post("/v1/analyze", dependencies=[service_auth])
    async def analyze(payload: AnalysisRequest):
        configured_model = config.ollama_model
        if payload.model_name != configured_model:
            raise HTTPException(
                status_code=400,
                detail="Requested model does not match the configured model",
            )
        result = await llm.analyze(payload)
        return result.model_dump()

    return application


app = create_app()
