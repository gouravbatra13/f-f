import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { redactSensitiveText } from '../common/sensitive-data-redactor.js';
import { requestContext } from '../common/middleware/request-context.js';
import type { AiConfig } from '../config/ai.config.js';
import { AiJobQueueService } from './ai-job-queue.service.js';
import {
  AiInvestigation,
  AiInvestigationSourceType,
  AiInvestigationStatus,
} from './ai-investigation.entity.js';
import type { AnalyzeDto } from './dto/analyze.dto.js';
import type { KnowledgeSearchDto } from './dto/knowledge-search.dto.js';

interface SourceRow {
  id: string;
  organizationId: string;
  projectId: string | null;
  title: string;
  description?: string | null;
  status: string;
  severity: string;
  eventCount?: number;
  firstSeenAt?: Date | string;
  lastSeenAt?: Date | string;
  environments?: unknown;
  endpoints?: unknown;
  releases?: unknown;
  assigneeUserId?: string | null;
  resolutionNotes?: string | null;
  ownerUserId?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

interface EventRow {
  errorMessage: string;
  stackTrace: string | null;
  severity: string;
  environment: string | null;
  release: string | null;
  endpoint: string | null;
  occurredAt: Date | string;
}

interface TimelineRow {
  action: string;
  details: Record<string, unknown> | string | null;
  createdAt: Date | string;
}

interface KnowledgeDocument {
  source_id: string;
  source_type: 'issue' | 'incident' | 'deployment';
  project_id: string | null;
  title: string;
  content: string;
  status: string | null;
  severity: string | null;
  updated_at: string | null;
}

export interface SimilarIssue {
  sourceId: string;
  title: string;
  status: string | null;
  severity: string | null;
  similarity: number;
  explanation: string;
}

export interface RelatedKnowledge extends SimilarIssue {
  sourceType: 'issue' | 'incident' | 'deployment';
}

interface AiAnalysis {
  modelName: string;
  sourceType: 'issue' | 'incident';
  sourceId: string;
  incidentSummary: string;
  probableRootCause: string;
  confidence: number;
  confidenceLabel: 'low' | 'medium' | 'high';
  confidenceRationale: string;
  evidenceSufficiency: 'insufficient' | 'limited' | 'supporting';
  evidence: { sourceId: string; statement: string }[];
  potentialImpact: string;
  debuggingSteps: string[];
  remediationSuggestions: string[];
  similarIssues: SimilarIssue[];
}

interface PythonSimilarIssue {
  source_id: string;
  source_type: 'issue' | 'incident' | 'deployment';
  title: string;
  status: string | null;
  severity: string | null;
  similarity: number;
  explanation: string;
}

@Injectable()
export class AiService {
  private readonly config: AiConfig;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(AiInvestigation)
    private readonly investigations: Repository<AiInvestigation>,
    configService: ConfigService,
    private readonly aiJobs: AiJobQueueService,
  ) {
    this.config = configService.getOrThrow<AiConfig>('ai');
  }

  async health() {
    if (!this.config.serviceUrl || !this.config.serviceToken) {
      return { status: 'unavailable', configured: false };
    }
    try {
      const response = await fetch(`${this.config.serviceUrl}/health`, {
        signal: AbortSignal.timeout(Math.min(this.config.timeoutMs, 5000)),
      });
      if (!response.ok) return { status: 'unavailable', configured: true };
      const result = (await response.json().catch(() => null)) as
        | { status?: string }
        | null;
      return {
        status: result?.status === 'ok' ? 'ok' : 'degraded',
        configured: true,
      };
    } catch {
      return { status: 'unavailable', configured: true };
    }
  }

  async analyzeIssue(
    issueId: string,
    userId: string,
    options: AnalyzeDto = {},
    idempotencyId?: string,
  ) {
    const issue = await this.findIssue(issueId, userId);
    const events = await this.getIssueEvents(issueId);
    const documents = await this.loadKnowledge(
      issue.organizationId,
      issue.projectId,
      issueId,
    );
    const query = this.buildIssueQuery(issue, events);
    const related = await this.retrieveSimilar(
      issue.organizationId,
      issue.projectId,
      query,
      documents,
      options,
      issueId,
    );
    const similar = related.filter(
      (item) => item.sourceType === 'issue',
    );
    const context = {
      issue: this.safeIssue(issue),
      recentEvents: events.map((event) => this.safeEvent(event)),
      recentDeployments: documents
        .filter((document) => document.source_type === 'deployment')
        .slice(0, 20)
        .map((document) => ({
          sourceId: document.source_id,
          title: document.title,
          content: document.content.slice(0, 1000),
        })),
    };
    return this.runAnalysis(
      issue.organizationId,
      issue.projectId,
      issue.id,
      AiInvestigationSourceType.ISSUE,
      JSON.stringify(context),
      [
        issue.id,
        ...similar.map((item) => item.sourceId),
        ...related.map((item) => item.sourceId),
      ],
      similar,
      related,
      userId,
      idempotencyId,
    );
  }

  async enqueueIssueAnalysis(
    issueId: string,
    userId: string,
    options: AnalyzeDto,
  ) {
    const issue = await this.findIssue(issueId, userId);
    return this.aiJobs.enqueue({
      actorUserId: userId,
      sourceId: issue.id,
      sourceType: 'issue',
      options,
    });
  }

  async enqueueIncidentAnalysis(
    incidentId: string,
    userId: string,
    options: AnalyzeDto,
  ) {
    const incident = await this.findIncident(incidentId, userId);
    return this.aiJobs.enqueue({
      actorUserId: userId,
      sourceId: incident.id,
      sourceType: 'incident',
      options,
    });
  }

  getAnalysisJobStatus(jobId: string, userId: string) {
    return this.aiJobs.getStatus(jobId, userId);
  }

  async analyzeIncident(
    incidentId: string,
    userId: string,
    options: AnalyzeDto = {},
    idempotencyId?: string,
  ) {
    const incident = await this.findIncident(incidentId, userId);
    const [timeline, linkedIssues] = await Promise.all([
      this.getIncidentTimeline(incidentId),
      this.getLinkedIssues(incidentId),
    ]);
    const documents = await this.loadKnowledge(
      incident.organizationId,
      incident.projectId,
      incidentId,
    );
    const query = this.buildIncidentQuery(incident, timeline, linkedIssues);
    const related = await this.retrieveSimilar(
      incident.organizationId,
      incident.projectId,
      query,
      documents,
      options,
    );
    const similar = related.filter((item) => item.sourceType === 'issue');
    const context = {
      incident: this.safeIncident(incident),
      timeline: timeline.map((item) => ({
        action: item.action,
        details: this.safeDetails(item.details),
        createdAt: item.createdAt,
      })),
      relatedIssues: linkedIssues.map((item) => this.safeIssue(item)),
      recentDeployments: documents
        .filter((document) => document.source_type === 'deployment')
        .slice(0, 20)
        .map((document) => ({
          sourceId: document.source_id,
          title: document.title,
          content: document.content.slice(0, 1000),
        })),
    };
    return this.runAnalysis(
      incident.organizationId,
      incident.projectId,
      incident.id,
      AiInvestigationSourceType.INCIDENT,
      JSON.stringify(context),
      [
        incident.id,
        ...linkedIssues.map((issue) => issue.id),
        ...similar.map((item) => item.sourceId),
        ...related.map((item) => item.sourceId),
      ],
      similar,
      related,
      userId,
      idempotencyId,
    );
  }

  async getSimilarIssues(issueId: string, userId: string, options: AnalyzeDto) {
    const issue = await this.findIssue(issueId, userId);
    const events = await this.getIssueEvents(issueId);
    const documents = await this.loadKnowledge(
      issue.organizationId,
      issue.projectId,
      issueId,
    );
    const related = await this.retrieveSimilar(
      issue.organizationId,
      issue.projectId,
      this.buildIssueQuery(issue, events),
      documents,
      options,
      issueId,
    );
    return {
      data: related.filter((item) => item.sourceType === 'issue'),
    };
  }

  async searchKnowledge(userId: string, dto: KnowledgeSearchDto) {
    await this.assertOrganizationMember(dto.organizationId, userId);
    if (dto.projectId) {
      await this.assertProjectAccess(dto.organizationId, dto.projectId, userId);
    }
    const documents = await this.loadKnowledge(
      dto.organizationId,
      dto.projectId ?? null,
    );
    await this.indexKnowledge(dto.organizationId, dto.projectId ?? null, documents);
    const results = await this.searchVector(
      dto.organizationId,
      dto.projectId ?? null,
      dto.query,
      dto.similarityThreshold ?? this.config.similarityThreshold,
      dto.limit ?? this.config.resultLimit,
    );
    const valid = this.filterCurrentResults(
      results,
      documents,
      dto.organizationId,
      dto.projectId ?? null,
    );
    return { data: valid };
  }

  async getLatestIssueAnalysis(issueId: string, userId: string) {
    const issue = await this.findIssue(issueId, userId);
    const investigation = await this.investigations.findOne({
      where: {
        organizationId: issue.organizationId,
        sourceType: AiInvestigationSourceType.ISSUE,
        sourceId: issue.id,
        status: AiInvestigationStatus.SUCCEEDED,
      },
      order: { createdAt: 'DESC' },
    });
    return { analysis: investigation ? this.toPublicAnalysis(investigation) : null };
  }

  async getIncidentSummary(incidentId: string, userId: string) {
    const incident = await this.findIncident(incidentId, userId);
    const investigation = await this.investigations.findOne({
      where: {
        organizationId: incident.organizationId,
        sourceType: AiInvestigationSourceType.INCIDENT,
        sourceId: incident.id,
        status: AiInvestigationStatus.SUCCEEDED,
      },
      order: { createdAt: 'DESC' },
    });
    return { analysis: investigation ? this.toPublicAnalysis(investigation) : null };
  }

  private async runAnalysis(
    organizationId: string,
    projectId: string | null,
    sourceId: string,
    sourceType: AiInvestigationSourceType,
    context: string,
    evidenceIds: string[],
    similarIssues: SimilarIssue[],
    relatedContext: RelatedKnowledge[],
    actorUserId: string,
    idempotencyId?: string,
  ) {
    if (idempotencyId) {
      const existing = await this.investigations.findOne({
        where: {
          id: idempotencyId,
          organizationId,
          sourceType,
          sourceId,
        },
      });
      if (existing) return this.toPublicAnalysis(existing);
    }

    const allowedEvidenceIds = [...new Set(evidenceIds)].slice(0, 50);
    const pythonResult = await this.postPython<unknown>('/v1/analyze', {
      model_name: this.config.modelName,
      source_type: sourceType.toLowerCase(),
      source_id: sourceId,
      context: context.slice(0, 30000),
      allowed_evidence_ids: allowedEvidenceIds,
      similar_issues: similarIssues.map((item) => ({
        source_id: item.sourceId,
        title: item.title,
        status: item.status,
        severity: item.severity,
        similarity: item.similarity,
        explanation: item.explanation,
      })),
      related_context: relatedContext.map((item) => ({
        source_id: item.sourceId,
        source_type: item.sourceType,
        title: item.title,
        status: item.status,
        severity: item.severity,
        similarity: item.similarity,
        explanation: item.explanation,
      })),
    });
    const analysis = this.validateAnalysis(
      pythonResult,
      sourceType.toLowerCase() as 'issue' | 'incident',
      sourceId,
      allowedEvidenceIds,
      similarIssues,
    );

    const investigation = this.investigations.create({
      id: idempotencyId ?? randomUUID(),
      organizationId,
      projectId,
      actorUserId,
      sourceType,
      sourceId,
      modelName: analysis.modelName,
      status: AiInvestigationStatus.SUCCEEDED,
      result: analysis as unknown as Record<string, unknown>,
    });
    const saved = await this.investigations.save(investigation);
    return this.toPublicAnalysis(saved);
  }

  private async findIssue(issueId: string, userId: string): Promise<SourceRow> {
    const rows = (await this.dataSource.query(
      `
        SELECT issue.id, issue.project_id AS projectId,
               project.organization_id AS organizationId,
               issue.title, issue.status, issue.severity,
               issue.event_count AS eventCount,
               issue.first_seen_at AS firstSeenAt,
               issue.last_seen_at AS lastSeenAt,
               issue.environments, issue.endpoints, issue.releases,
               issue.assignee_user_id AS assigneeUserId
        FROM issues issue
        INNER JOIN projects project ON project.id = issue.project_id
        INNER JOIN organizations organization
          ON organization.id = project.organization_id
        INNER JOIN organization_members membership
          ON membership.organization_id = project.organization_id
        WHERE issue.id = ? AND membership.user_id = ?
          AND organization.deleted_at IS NULL
        LIMIT 1
      `,
      [issueId, userId],
    )) as SourceRow[];
    if (!rows[0]) throw new NotFoundException('Issue not found');
    return rows[0];
  }

  private async findIncident(
    incidentId: string,
    userId: string,
  ): Promise<SourceRow> {
    const rows = (await this.dataSource.query(
      `
        SELECT incident.id, incident.organization_id AS organizationId,
               incident.project_id AS projectId, incident.title,
               incident.description, incident.status, incident.severity,
               incident.owner_user_id AS ownerUserId,
               incident.resolution_notes AS resolutionNotes,
               incident.created_at AS createdAt,
               incident.updated_at AS updatedAt
        FROM incidents incident
        INNER JOIN organizations organization
          ON organization.id = incident.organization_id
        INNER JOIN organization_members membership
          ON membership.organization_id = incident.organization_id
        WHERE incident.id = ? AND membership.user_id = ?
          AND incident.deleted_at IS NULL
          AND organization.deleted_at IS NULL
        LIMIT 1
      `,
      [incidentId, userId],
    )) as SourceRow[];
    if (!rows[0]) throw new NotFoundException('Incident not found');
    return rows[0];
  }

  private async assertOrganizationMember(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const rows = (await this.dataSource.query(
      `
        SELECT membership.organization_id AS organizationId
        FROM organization_members membership
        INNER JOIN organizations organization
          ON organization.id = membership.organization_id
        WHERE membership.organization_id = ? AND membership.user_id = ?
          AND organization.deleted_at IS NULL
        LIMIT 1
      `,
      [organizationId, userId],
    )) as { organizationId: string }[];
    if (!rows[0]) throw new NotFoundException('Organization not found');
  }

  private async assertProjectAccess(
    organizationId: string,
    projectId: string,
    userId: string,
  ): Promise<void> {
    const rows = (await this.dataSource.query(
      `
        SELECT project.id
        FROM projects project
        INNER JOIN organizations organization
          ON organization.id = project.organization_id
        INNER JOIN organization_members membership
          ON membership.organization_id = project.organization_id
        WHERE project.id = ? AND project.organization_id = ?
          AND membership.user_id = ?
          AND organization.deleted_at IS NULL
        LIMIT 1
      `,
      [projectId, organizationId, userId],
    )) as { id: string }[];
    if (!rows[0]) throw new NotFoundException('Project not found');
  }

  private async getIssueEvents(issueId: string): Promise<EventRow[]> {
    return (await this.dataSource.query(
      `
        SELECT error_message AS errorMessage,
               stack_trace AS stackTrace,
               severity, environment, \`release\`, endpoint,
               occurred_at AS occurredAt
        FROM error_events
        WHERE issue_id = ?
        ORDER BY occurred_at DESC
        LIMIT 10
      `,
      [issueId],
    )) as EventRow[];
  }

  private async getIncidentTimeline(
    incidentId: string,
  ): Promise<TimelineRow[]> {
    return (await this.dataSource.query(
      `
        SELECT action, details, created_at AS createdAt
        FROM incident_timeline
        WHERE incident_id = ?
        ORDER BY created_at DESC
        LIMIT 100
      `,
      [incidentId],
    )) as TimelineRow[];
  }

  private async getLinkedIssues(incidentId: string): Promise<SourceRow[]> {
    return (await this.dataSource.query(
      `
        SELECT issue.id, issue.project_id AS projectId,
               project.organization_id AS organizationId,
               issue.title, issue.status, issue.severity,
               issue.event_count AS eventCount,
               issue.first_seen_at AS firstSeenAt,
               issue.last_seen_at AS lastSeenAt,
               issue.environments, issue.endpoints, issue.releases
        FROM incident_issues link
        INNER JOIN issues issue ON issue.id = link.issue_id
        INNER JOIN projects project ON project.id = issue.project_id
        WHERE link.incident_id = ?
        ORDER BY link.created_at ASC
        LIMIT 50
      `,
      [incidentId],
    )) as SourceRow[];
  }

  private async loadKnowledge(
    organizationId: string,
    projectId: string | null,
    excludeSourceId?: string,
  ): Promise<KnowledgeDocument[]> {
    const issueProjectFilter = projectId ? 'AND issue.project_id = ?' : '';
    const issueExclusionFilter = excludeSourceId ? 'AND issue.id <> ?' : '';
    const issues = (await this.dataSource.query(
      `
        SELECT issue.id, issue.project_id AS projectId, issue.title,
               issue.status, issue.severity, issue.event_count AS eventCount,
               issue.environments, issue.endpoints, issue.releases,
               issue.last_seen_at AS updatedAt,
               (SELECT event.error_message FROM error_events event
                WHERE event.issue_id = issue.id
                ORDER BY event.occurred_at DESC LIMIT 1) AS errorMessage,
               (SELECT event.stack_trace FROM error_events event
                WHERE event.issue_id = issue.id
                ORDER BY event.occurred_at DESC LIMIT 1) AS stackTrace
        FROM issues issue
        INNER JOIN projects project ON project.id = issue.project_id
        WHERE project.organization_id = ?
          ${issueProjectFilter}
          ${issueExclusionFilter}
        ORDER BY issue.last_seen_at DESC
        LIMIT 150
      `,
      [
        organizationId,
        ...(projectId ? [projectId] : []),
        ...(excludeSourceId ? [excludeSourceId] : []),
      ],
    )) as Record<string, unknown>[];

    const incidentProjectFilter = projectId
      ? 'AND (incident.project_id = ? OR incident.project_id IS NULL)'
      : '';
    const incidentExclusionFilter = excludeSourceId
      ? 'AND incident.id <> ?'
      : '';
    const incidents = (await this.dataSource.query(
      `
        SELECT incident.id, incident.project_id AS projectId,
               incident.title, incident.description, incident.status,
               incident.severity,
               incident.resolution_notes AS resolutionNotes,
               incident.updated_at AS updatedAt
        FROM incidents incident
        WHERE incident.organization_id = ?
          AND incident.deleted_at IS NULL
          ${incidentProjectFilter}
          ${incidentExclusionFilter}
        ORDER BY incident.updated_at DESC
        LIMIT 80
      `,
      [
        organizationId,
        ...(projectId ? [projectId] : []),
        ...(excludeSourceId ? [excludeSourceId] : []),
      ],
    )) as Record<string, unknown>[];

    const deployments = projectId
      ? ((await this.dataSource.query(
          `
            SELECT deployment.id, deployment.project_id AS projectId,
                   deployment.environment, deployment.\`release\`,
                   deployment.status, deployment.deployed_at AS deployedAt,
                   deployment.commit_hash AS commitHash
            FROM deployments deployment
            WHERE deployment.project_id = ?
              AND deployment.deleted_at IS NULL
            ORDER BY deployment.deployed_at DESC
            LIMIT 30
          `,
          [projectId],
        )) as Record<string, unknown>[])
      : [];

    const docs: KnowledgeDocument[] = [];
    for (const issue of issues) {
      const sourceId = String(issue.id);
      docs.push(
        this.toDocument(
          'issue',
          sourceId,
          String(issue.projectId),
          String(issue.title),
          [
            `Status: ${issue.status}; Severity: ${issue.severity}; Events: ${issue.eventCount}`,
            `Environments: ${this.asText(issue.environments)}`,
            `Endpoints: ${this.asText(issue.endpoints)}`,
            `Releases: ${this.asText(issue.releases)}`,
            `Latest error: ${issue.errorMessage ?? ''}`,
            `Sanitized stack trace: ${issue.stackTrace ?? ''}`,
          ].join('\n'),
          issue.status,
          issue.severity,
          issue.updatedAt,
        ),
      );
    }
    for (const incident of incidents) {
      docs.push(
        this.toDocument(
          'incident',
          String(incident.id),
          incident.projectId ? String(incident.projectId) : null,
          String(incident.title),
          [
            `Status: ${incident.status}; Severity: ${incident.severity}`,
            `Description: ${incident.description ?? ''}`,
            `Resolution notes: ${incident.resolutionNotes ?? ''}`,
          ].join('\n'),
          incident.status,
          incident.severity,
          incident.updatedAt,
        ),
      );
    }
    for (const deployment of deployments) {
      docs.push(
        this.toDocument(
          'deployment',
          String(deployment.id),
          String(deployment.projectId),
          `${deployment.release} · ${deployment.environment}`,
          `Status: ${deployment.status}; Deployed: ${deployment.deployedAt}; Commit: ${deployment.commitHash ?? 'not recorded'}`,
          deployment.status,
          null,
          deployment.deployedAt,
        ),
      );
    }
    return docs;
  }

  private toDocument(
    sourceType: KnowledgeDocument['source_type'],
    sourceId: string,
    projectId: string | null,
    title: string,
    content: string,
    status: unknown,
    severity: unknown,
    updatedAt: unknown,
  ): KnowledgeDocument {
    return {
      source_id: sourceId,
      source_type: sourceType,
      project_id: projectId,
      title: this.safeText(title, 512),
      content: this.safeText(content, 40000) || 'No sanitized context is available.',
      status: status ? this.safeText(String(status), 40) : null,
      severity: severity ? this.safeText(String(severity), 40) : null,
      updated_at: this.safeTimestamp(updatedAt),
    };
  }

  private safeTimestamp(value: unknown): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }

  private async retrieveSimilar(
    organizationId: string,
    projectId: string | null,
    query: string,
    documents: KnowledgeDocument[],
    options: AnalyzeDto,
    excludeSourceId?: string,
  ): Promise<RelatedKnowledge[]> {
    await this.indexKnowledge(organizationId, projectId, documents);
    const results = await this.searchVector(
      organizationId,
      projectId,
      query,
      options.similarityThreshold ?? this.config.similarityThreshold,
      options.limit ?? this.config.resultLimit,
    );
    return this.filterCurrentResults(
      results,
      documents,
      organizationId,
      projectId,
    )
      .filter((item) => item.sourceId !== excludeSourceId)
      .map((item) => ({
        sourceId: item.sourceId,
        sourceType: item.sourceType,
        title: item.title,
        status: item.status,
        severity: item.severity,
        similarity: item.similarity,
        explanation: item.explanation,
      }));
  }

  private async indexKnowledge(
    organizationId: string,
    projectId: string | null,
    documents: KnowledgeDocument[],
  ): Promise<void> {
    await this.postPython('/v1/knowledge/index', {
      organization_id: organizationId,
      project_id: projectId,
      replace_scope: true,
      documents,
    });
  }

  private async searchVector(
    organizationId: string,
    projectId: string | null,
    query: string,
    similarityThreshold: number,
    limit: number,
  ): Promise<PythonSimilarIssue[]> {
    const response = await this.postPython<unknown>('/v1/knowledge/search', {
      organization_id: organizationId,
      project_id: projectId,
      query: query.slice(0, 5000),
      similarity_threshold: similarityThreshold,
      limit,
    });
    if (
      !this.isRecord(response) ||
      !Array.isArray(response.results) ||
      response.results.length > 10
    ) {
      throw new BadGatewayException('Local AI returned an invalid search response');
    }
    return response.results.map((item) => {
      if (
        !this.isRecord(item) ||
        typeof item.source_id !== 'string' ||
        !['issue', 'incident', 'deployment'].includes(
          String(item.source_type),
        ) ||
        typeof item.title !== 'string' ||
        typeof item.similarity !== 'number' ||
        typeof item.explanation !== 'string' ||
        !(typeof item.status === 'string' || item.status === null) ||
        !(typeof item.severity === 'string' || item.severity === null)
      ) {
        throw new BadGatewayException(
          'Local AI returned an invalid search response',
        );
      }
      return item as unknown as PythonSimilarIssue;
    });
  }

  private filterCurrentResults(
    results: PythonSimilarIssue[],
    documents: KnowledgeDocument[],
    organizationId: string,
    projectId: string | null,
  ) {
    const current = new Map(
      documents.map((document) => [
        `${document.source_type}:${document.source_id}`,
        document,
      ]),
    );
    return results.flatMap((result) => {
      const document = current.get(`${result.source_type}:${result.source_id}`);
      if (
        !document ||
        !organizationId ||
        (projectId &&
          document.project_id !== projectId &&
          !(document.source_type === 'incident' && document.project_id === null))
      ) {
        return [];
      }
      return [
        {
          sourceId: document.source_id,
          sourceType: document.source_type,
          title: document.title,
          status: document.status,
          severity: document.severity,
          similarity: Math.max(0, Math.min(1, result.similarity)),
          explanation: document.content.slice(0, 500),
        },
      ];
    });
  }

  private async postPython<T = unknown>(
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    if (!this.config.serviceUrl || !this.config.serviceToken) {
      throw new ServiceUnavailableException('Local AI is not configured');
    }
    const requestId = requestContext.getStore()?.requestId;
    try {
      const response = await fetch(`${this.config.serviceUrl}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          'X-Service-Token': this.config.serviceToken,
          ...(requestId ? { 'X-Request-ID': requestId } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        if (response.status === 503) {
          throw new ServiceUnavailableException(
            'Local AI is unavailable. Check the embedding model and Ollama configuration.',
          );
        }
        if (response.status === 502) {
          throw new BadGatewayException(
            'Local AI returned an invalid response. Retry the analysis.',
          );
        }
        throw new ServiceUnavailableException('Local AI request failed');
      }
      return payload as T;
    } catch (error) {
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof BadGatewayException
      ) {
        throw error;
      }
      if (
        error instanceof DOMException &&
        error.name === 'TimeoutError'
      ) {
        throw new GatewayTimeoutException('Local AI request timed out');
      }
      throw new ServiceUnavailableException('Local AI is unavailable');
    }
  }

  private validateAnalysis(
    value: unknown,
    sourceType: 'issue' | 'incident',
    sourceId: string,
    allowedEvidenceIds: string[],
    similarIssues: SimilarIssue[],
  ): AiAnalysis {
    const requiredStrings = [
      'model_name',
      'incident_summary',
      'probable_root_cause',
      'confidence_rationale',
      'evidence_sufficiency',
      'potential_impact',
    ];
    if (
      !this.isRecord(value) ||
      value.source_type !== sourceType ||
      value.source_id !== sourceId ||
      value.model_name !== this.config.modelName ||
      requiredStrings.some(
        (key) =>
          typeof value[key] !== 'string' ||
          (value[key] as string).length > 4000,
      ) ||
      typeof value.confidence !== 'number' ||
      value.confidence < 0 ||
      value.confidence > 1 ||
      !['low', 'medium', 'high'].includes(String(value.confidence_label)) ||
      !['insufficient', 'limited', 'supporting'].includes(
        String(value.evidence_sufficiency),
      ) ||
      !Array.isArray(value.debugging_steps) ||
      !Array.isArray(value.remediation_suggestions) ||
      !Array.isArray(value.evidence)
    ) {
      throw new BadGatewayException(
        'Local AI returned a response that did not match the analysis schema',
      );
    }
    const evidence = value.evidence.flatMap((item) => {
      if (
        !this.isRecord(item) ||
        typeof item.source_id !== 'string' ||
        !allowedEvidenceIds.includes(item.source_id) ||
        typeof item.statement !== 'string'
      ) {
        return [];
      }
      return [
        {
          sourceId: item.source_id,
          statement: this.safeText(item.statement, 1000),
        },
      ];
    });
    if (
      evidence.length !== value.evidence.length ||
      !value.debugging_steps.every(
        (item) => typeof item === 'string' && item.length <= 1000,
      ) ||
      !value.remediation_suggestions.every(
        (item) => typeof item === 'string' && item.length <= 1000,
      )
    ) {
      throw new BadGatewayException(
        'Local AI returned a response that did not match the analysis schema',
      );
    }
    return {
      modelName: this.safeText(value.model_name as string, 100),
      sourceType,
      sourceId,
      incidentSummary: this.safeText(value.incident_summary as string, 4000),
      probableRootCause: this.safeText(
        evidence.length
          ? (value.probable_root_cause as string)
          : `Insufficient evidence to identify a probable root cause. AI hypothesis: ${value.probable_root_cause as string}`,
        3000,
      ),
      confidence: evidence.length
        ? value.confidence
        : Math.min(value.confidence, 0.3),
      confidenceLabel: (evidence.length
        ? value.confidence_label
        : 'low') as 'low' | 'medium' | 'high',
      confidenceRationale: this.safeText(
        value.confidence_rationale as string,
        1500,
      ),
      evidenceSufficiency: (evidence.length
        ? value.evidence_sufficiency
        : 'insufficient') as
        | 'insufficient'
        | 'limited'
        | 'supporting',
      evidence,
      potentialImpact: this.safeText(value.potential_impact as string, 2000),
      debuggingSteps: (value.debugging_steps as string[]).map((item) =>
        this.safeText(item, 1000),
      ),
      remediationSuggestions: (
        value.remediation_suggestions as string[]
      ).map((item) => this.safeText(item, 1000)),
      similarIssues,
    };
  }

  private toPublicAnalysis(investigation: AiInvestigation) {
    return {
      id: investigation.id,
      modelName: investigation.modelName,
      status: investigation.status,
      createdAt: investigation.createdAt,
      analysis: investigation.result,
    };
  }

  private safeIssue(issue: SourceRow) {
    return {
      id: issue.id,
      title: this.safeText(issue.title, 512),
      status: issue.status,
      severity: issue.severity,
      eventCount: issue.eventCount,
      firstSeenAt: issue.firstSeenAt,
      lastSeenAt: issue.lastSeenAt,
      environments: this.asText(issue.environments),
      endpoints: this.asText(issue.endpoints),
      releases: this.asText(issue.releases),
    };
  }

  private safeIncident(incident: SourceRow) {
    return {
      id: incident.id,
      title: this.safeText(incident.title, 255),
      description: this.safeText(incident.description ?? '', 10000),
      severity: incident.severity,
      status: incident.status,
      ownerUserId: incident.ownerUserId,
      resolutionNotes: this.safeText(incident.resolutionNotes ?? '', 10000),
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
    };
  }

  private safeEvent(event: EventRow) {
    return {
      errorMessage: this.safeText(event.errorMessage, 2000),
      stackTrace: this.safeText(event.stackTrace ?? '', 12000),
      severity: event.severity,
      environment: event.environment,
      release: event.release,
      endpoint: this.safeText(event.endpoint ?? '', 2048),
      occurredAt: event.occurredAt,
    };
  }

  private safeDetails(
    details: Record<string, unknown> | string | null,
  ): unknown {
    if (!details) return null;
    const text = typeof details === 'string' ? details : JSON.stringify(details);
    return redactSensitiveText(text).slice(0, 2000);
  }

  private buildIssueQuery(issue: SourceRow, events: EventRow[]): string {
    return [
      issue.title,
      ...events.slice(0, 3).map((event) => event.errorMessage),
      ...events
        .slice(0, 2)
        .map((event) => event.stackTrace?.slice(0, 1200) ?? ''),
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildIncidentQuery(
    incident: SourceRow,
    timeline: TimelineRow[],
    issues: SourceRow[],
  ): string {
    return [
      incident.title,
      incident.description,
      incident.resolutionNotes,
      ...timeline.slice(0, 10).map((item) => item.action),
      ...issues.map((issue) => issue.title),
    ]
      .filter(Boolean)
      .join('\n');
  }

  private safeText(value: string, maxLength: number): string {
    return redactSensitiveText(value).slice(0, maxLength);
  }

  private asText(value: unknown): string {
    if (value === undefined || value === null) return '';
    return typeof value === 'string' ? value : JSON.stringify(value) ?? '';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
