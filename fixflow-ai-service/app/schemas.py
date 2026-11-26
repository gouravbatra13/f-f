from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.redaction import redact_text


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class KnowledgeDocument(StrictModel):
    source_id: str = Field(min_length=1, max_length=36)
    source_type: Literal["issue", "incident", "deployment"]
    project_id: str | None = Field(default=None, max_length=36)
    title: str = Field(min_length=1, max_length=512)
    content: str = Field(min_length=1, max_length=40000)
    status: str | None = Field(default=None, max_length=40)
    severity: str | None = Field(default=None, max_length=40)
    updated_at: str | None = Field(default=None, max_length=40)

    @field_validator("title", "content")
    @classmethod
    def redact_fields(cls, value: str) -> str:
        return redact_text(value).strip()


class IndexRequest(StrictModel):
    organization_id: str = Field(min_length=1, max_length=36)
    project_id: str | None = Field(default=None, max_length=36)
    replace_scope: bool = True
    documents: list[KnowledgeDocument] = Field(max_length=300)


class KnowledgeSearchRequest(StrictModel):
    organization_id: str = Field(min_length=1, max_length=36)
    project_id: str | None = Field(default=None, max_length=36)
    query: str = Field(min_length=1, max_length=5000)
    similarity_threshold: float = Field(default=0.45, ge=0, le=1)
    limit: int = Field(default=5, ge=1, le=10)

    @field_validator("query")
    @classmethod
    def redact_query(cls, value: str) -> str:
        return redact_text(value).strip()


class SimilarIssue(StrictModel):
    source_id: str
    title: str
    status: str | None
    severity: str | None
    similarity: float = Field(ge=0, le=1)
    explanation: str


class RelatedContext(StrictModel):
    source_id: str = Field(min_length=1, max_length=36)
    source_type: Literal["issue", "incident", "deployment"]
    title: str = Field(max_length=512)
    status: str | None = Field(default=None, max_length=40)
    severity: str | None = Field(default=None, max_length=40)
    similarity: float = Field(ge=0, le=1)
    explanation: str = Field(max_length=1000)


class EvidenceItem(StrictModel):
    source_id: str
    statement: str = Field(max_length=1000)


class AnalysisRequest(StrictModel):
    model_name: str = Field(min_length=1, max_length=100)
    source_type: Literal["issue", "incident"]
    source_id: str = Field(min_length=1, max_length=36)
    context: str = Field(min_length=1, max_length=30000)
    allowed_evidence_ids: list[str] = Field(max_length=50)
    similar_issues: list[SimilarIssue] = Field(max_length=10)
    related_context: list[RelatedContext] = Field(default_factory=list, max_length=10)

    @field_validator("context")
    @classmethod
    def redact_context(cls, value: str) -> str:
        return redact_text(value).strip()


class AnalysisResponse(StrictModel):
    model_name: str
    source_type: Literal["issue", "incident"]
    source_id: str
    incident_summary: str = Field(max_length=4000)
    probable_root_cause: str = Field(max_length=3000)
    confidence: float = Field(ge=0, le=1)
    confidence_label: Literal["low", "medium", "high"]
    confidence_rationale: str = Field(max_length=1500)
    evidence_sufficiency: Literal["insufficient", "limited", "supporting"]
    evidence: list[EvidenceItem] = Field(max_length=20)
    potential_impact: str = Field(max_length=2000)
    debugging_steps: list[str] = Field(max_length=12)
    remediation_suggestions: list[str] = Field(max_length=12)
    similar_issues: list[SimilarIssue] = Field(max_length=10)
