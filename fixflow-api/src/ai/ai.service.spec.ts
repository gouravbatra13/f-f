import {
  BadGatewayException,
  GatewayTimeoutException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DataSource, Repository } from 'typeorm';
import { AiService } from './ai.service.js';
import type { AiJobQueueService } from './ai-job-queue.service.js';
import type { AiInvestigation } from './ai-investigation.entity.js';

const aiConfig = {
  serviceUrl: 'http://127.0.0.1:8000',
  serviceToken: 'unit-test-service-token-with-at-least-32-bytes',
  timeoutMs: 120_000,
  modelName: 'deepseek-coder:latest',
  similarityThreshold: 0.45,
  resultLimit: 5,
};

const issue = {
  id: 'issue-1',
  organizationId: 'organization-1',
  projectId: null,
  title: 'Database timeout',
  status: 'open',
  severity: 'high',
  eventCount: 1,
  environments: ['production'],
  endpoints: ['/api/orders'],
  releases: ['v1.0'],
};

function createService(query: ReturnType<typeof vi.fn>) {
  const investigations = {
    create: vi.fn((value: AiInvestigation) => value),
    save: vi.fn(async (value: AiInvestigation) => ({
      ...value,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    })),
    findOne: vi.fn(),
  };
  const configService = {
    getOrThrow: vi.fn(() => aiConfig),
  };
  const aiJobs = {
    enqueue: vi.fn(),
    getStatus: vi.fn(),
    readiness: vi.fn(),
  };
  const service = new AiService(
    { query } as unknown as DataSource,
    investigations as unknown as Repository<AiInvestigation>,
    configService as unknown as ConfigService,
    aiJobs as unknown as AiJobQueueService,
  );
  return { service, investigations, aiJobs };
}

function analysisResponse() {
  return {
    model_name: aiConfig.modelName,
    source_type: 'issue',
    source_id: issue.id,
    incident_summary: 'A database request timed out.',
    probable_root_cause: 'A saturated pool is one possible explanation.',
    confidence: 0.4,
    confidence_label: 'low',
    confidence_rationale: 'The available data is limited.',
    evidence_sufficiency: 'limited',
    evidence: [
      { source_id: issue.id, statement: 'One request timed out.' },
    ],
    potential_impact: 'Some requests may fail.',
    debugging_steps: ['Inspect database connection metrics.'],
    remediation_suggestions: ['Verify connection-pool settings.'],
    similar_issues: [],
  };
}

describe('AiService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hides issues that are not visible to the requesting organization member', async () => {
    const { service } = createService(vi.fn().mockResolvedValue([]));

    await expect(service.analyzeIssue('missing-issue', 'user-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('validates organization access before placing an AI analysis job', async () => {
    const query = vi.fn().mockResolvedValueOnce([issue]);
    const { service, aiJobs } = createService(query);
    aiJobs.enqueue.mockResolvedValue({ jobId: 'ai-test', status: 'waiting' });

    await expect(
      service.enqueueIssueAnalysis(issue.id, 'user-1', { limit: 3 }),
    ).resolves.toEqual({ jobId: 'ai-test', status: 'waiting' });
    expect(aiJobs.enqueue).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      sourceId: issue.id,
      sourceType: 'issue',
      options: { limit: 3 },
    });

    const inaccessible = createService(vi.fn().mockResolvedValue([]));
    await expect(
      inaccessible.service.enqueueIssueAnalysis('other-issue', 'user-1', {}),
    ).rejects.toThrow(NotFoundException);
    expect(inaccessible.aiJobs.enqueue).not.toHaveBeenCalled();
  });

  it('keeps knowledge search scoped to organizations the caller belongs to', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const { service } = createService(query);
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      service.searchKnowledge('user-1', {
        organizationId: 'organization-other',
        query: 'database failure',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns a persisted, validated analysis when the local AI service succeeds', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([issue])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const { service, investigations } = createService(query);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ indexed_documents: 0 }), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ results: [] }), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(analysisResponse()), { status: 200 }),
        ),
    );

    const result = await service.analyzeIssue(issue.id, 'user-1');

    expect(result.status).toBe('SUCCEEDED');
    expect(result.analysis).toMatchObject({
      sourceId: issue.id,
      probableRootCause: 'A saturated pool is one possible explanation.',
      evidence: [{ sourceId: issue.id }],
    });
    expect(investigations.save).toHaveBeenCalledTimes(1);
  });

  it('serializes MySQL date values to the bounded ISO timestamp shape for Python', async () => {
    const seenAt = new Date('2026-11-17T10:00:00.000Z');
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ ...issue, projectId: 'project-1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'similar-issue',
          projectId: 'project-1',
          title: 'Related timeout',
          status: 'open',
          severity: 'error',
          eventCount: 1,
          environments: ['production'],
          endpoints: ['/api/orders'],
          releases: ['v1.0'],
          updatedAt: seenAt,
          errorMessage: 'Database timeout',
          stackTrace: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const { service } = createService(query);
    const mockedFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ indexed_documents: 1 }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(analysisResponse()), { status: 200 }),
      );
    vi.stubGlobal('fetch', mockedFetch);

    await service.analyzeIssue(issue.id, 'user-1');

    const indexRequest = JSON.parse(mockedFetch.mock.calls[0][1].body);
    expect(indexRequest.documents[0].updated_at).toBe(
      '2026-11-17T10:00:00.000Z',
    );
    expect(indexRequest.documents[0].updated_at).toHaveLength(24);
  });

  it('reports the Python/Ollama service as unavailable instead of returning a fake result', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([issue])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const { service } = createService(query);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'internal detail' }), {
          status: 503,
        }),
      ),
    );

    await expect(service.analyzeIssue(issue.id, 'user-1')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('maps AI request timeouts and invalid model output to explicit API errors', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([issue])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const { service } = createService(query);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(
        new DOMException('Request timed out', 'TimeoutError'),
      ),
    );

    await expect(service.analyzeIssue(issue.id, 'user-1')).rejects.toThrow(
      GatewayTimeoutException,
    );

    const invalidQuery = vi
      .fn()
      .mockResolvedValueOnce([issue])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const invalid = createService(invalidQuery).service;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ indexed_documents: 0 }), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ results: [] }), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ invalid: true }), { status: 200 }),
        ),
    );
    await expect(invalid.analyzeIssue(issue.id, 'user-1')).rejects.toThrow(
      BadGatewayException,
    );
  });
});
