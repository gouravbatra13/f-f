import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createHash, randomUUID } from 'node:crypto';
import { setMaxListeners } from 'node:events';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter.js';
import { bodyParserErrorHandler } from '../src/common/middleware/body-parser-error.handler.js';
import { OrganizationRole } from '../src/organizations/organization-role.enum.js';
import { Organization } from '../src/organizations/organization.entity.js';
import { ErrorEvent } from '../src/issues/error-event.entity.js';
import { IssueSeverity } from '../src/issues/issue-severity.enum.js';
import { Issue } from '../src/issues/issue.entity.js';
import { IssueStatus } from '../src/issues/issue-status.enum.js';
import { ProjectApiKey } from '../src/projects/project-api-key.entity.js';
import { User } from '../src/users/user.entity.js';
import { AlertRuleType } from '../src/alerts/alert-rule-type.enum.js';
import { AlertEnvironment } from '../src/alerts/alert-environment.enum.js';

const API = '/api/v1';
const PASSWORD = 'Strong-password-123!';

describe('Error ingestion and issue management (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let owner: { id: string; email: string; token: string };
  let member: { id: string; email: string; token: string };
  let viewer: { id: string; email: string; token: string };
  let outsider: { id: string; email: string; token: string };
  let organizationId: string;
  let project: { id: string };
  let secondProject: { id: string };
  let apiKey: string;
  let secondProjectKey: string;
  const emails = new Set<string>();

  beforeAll(async () => {
    process.env.MYSQL_HOST ??= '127.0.0.1';
    process.env.MYSQL_PORT ??= '33316';
    process.env.MYSQL_USER ??= 'fixflow';
    process.env.MYSQL_PASSWORD ??= 'local-dev-only';
    process.env.MYSQL_DATABASE ??= 'fixflow_ai';
    process.env.ACCESS_TOKEN_SECRET ??=
      'test-only-secret-that-is-at-least-32-bytes-long';
    process.env.COOKIE_SECURE ??= 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ bodyParser: false });
    app.use(cookieParser());
    app.use(express.json({ limit: '64kb' }));
    app.use(express.urlencoded({ extended: true, limit: '64kb' }));
    app.use(bodyParserErrorHandler);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    setMaxListeners(50, app.getHttpServer());
    dataSource = app.get(DataSource);

    owner = await registerUser();
    member = await registerUser();
    viewer = await registerUser();
    outsider = await registerUser();

    const organizationResponse = await request(app.getHttpServer())
      .post(`${API}/organizations`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Phase Six Error Tests' })
      .expect(201);
    organizationId = organizationResponse.body.id as string;

    const invitation = await request(app.getHttpServer())
      .post(`${API}/organizations/${organizationId}/invitations`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: member.email, role: OrganizationRole.DEVELOPER })
      .expect(201);
    await request(app.getHttpServer())
      .post(`${API}/organizations/invitations/accept`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ token: invitation.body.mockDelivery.acceptToken })
      .expect(201);
    const viewerInvitation = await request(app.getHttpServer())
      .post(`${API}/organizations/${organizationId}/invitations`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: viewer.email, role: OrganizationRole.VIEWER })
      .expect(201);
    await request(app.getHttpServer())
      .post(`${API}/organizations/invitations/accept`)
      .set('Authorization', `Bearer ${viewer.token}`)
      .send({ token: viewerInvitation.body.mockDelivery.acceptToken })
      .expect(201);

    project = await createProject('Error Test Project');
    secondProject = await createProject('Other Error Project');
    apiKey = await createApiKey(project.id);
    secondProjectKey = await createApiKey(secondProject.id);
  }, 30_000);

  afterAll(async () => {
    if (organizationId) {
      await dataSource
        .getRepository(Organization)
        .delete({ id: organizationId });
    }
    for (const email of emails) {
      await dataSource.getRepository(User).delete({ email });
    }
    await app.close();
  });

  it('ingests using the project key and redacts secrets and personal metadata', async () => {
    const response = await ingest(apiKey, {
      message: 'Checkout failed password=hunter2 person@example.test',
      stackTrace: 'Error\n  at checkout (src/checkout.ts:22:5)\nAuthorization: Bearer secret-value',
      severity: IssueSeverity.ERROR,
      environment: 'production',
      release: '2026.11.12',
      endpoint: '/checkout?access_token=secret-value',
      metadata: {
        feature: 'checkout',
        password: 'hidden',
        email: 'person@example.test',
        nested: { apiKey: 'hidden', count: 2 },
      },
    }).expect(201);

    expect(response.body).toMatchObject({
      eventCount: 1,
      isNewIssue: true,
    });
    const event = await dataSource
      .getRepository(ErrorEvent)
      .findOneOrFail({ where: { id: response.body.eventId as string } });
    expect(event.projectId).toBe(project.id);
    expect(event.errorMessage).not.toContain('hunter2');
    expect(event.errorMessage).not.toContain('person@example.test');
    expect(event.stackTrace).not.toContain('secret-value');
    expect(event.endpoint).toBe('/checkout');
    expect(event.metadata).toEqual({ feature: 'checkout', nested: { count: 2 } });
  });

  it('groups normalized duplicates and atomically tracks count and dimensions', async () => {
    const common = {
      message: 'Order 123456 failed while saving',
      severity: IssueSeverity.WARNING,
      environment: 'staging',
      release: 'v2',
      endpoint: '/orders',
      timestamp: '2026-01-01T10:00:00.000Z',
    };
    const first = await ingest(apiKey, {
      ...common,
      stackTrace: 'at save (src/orders.ts:20:4)',
      severity: IssueSeverity.CRITICAL,
      environment: 'production',
      release: 'v1',
      timestamp: '2026-01-03T10:00:00.000Z',
    }).expect(201);
    const second = await ingest(apiKey, {
      ...common,
      message: 'Order 987654 failed while saving',
      stackTrace: 'at save (/srv/app/src/orders.ts:91:12)',
      severity: IssueSeverity.WARNING,
    }).expect(201);

    expect(second.body.issueId).toBe(first.body.issueId);
    expect(second.body.fingerprint).toBe(first.body.fingerprint);
    expect(second.body.eventCount).toBe(2);
    const issue = await dataSource
      .getRepository(Issue)
      .findOneByOrFail({ id: first.body.issueId as string });
    expect(issue.eventCount).toBe(2);
    expect(issue.firstSeenAt.toISOString()).toContain('2026-01-01');
    expect(issue.lastSeenAt.toISOString()).toContain('2026-01-03');
    expect(issue.environments).toEqual(['production', 'staging']);
    expect(issue.releases).toEqual(['v1', 'v2']);
    expect(issue.severity).toBe(IssueSeverity.CRITICAL);
  });

  it('separates different errors and scopes identical fingerprints to each project', async () => {
    const basePayload = {
      message: `Distinctive error ${randomUUID()}`,
      stackTrace: 'at handle (src/handler.ts:3:1)',
      severity: IssueSeverity.ERROR,
    };
    const first = await ingest(apiKey, basePayload).expect(201);
    const different = await ingest(apiKey, {
      ...basePayload,
      message: `${basePayload.message} with another cause`,
    }).expect(201);
    const otherProject = await ingest(secondProjectKey, basePayload).expect(201);

    expect(different.body.issueId).not.toBe(first.body.issueId);
    expect(otherProject.body.issueId).not.toBe(first.body.issueId);
    expect(otherProject.body.fingerprint).toBe(first.body.fingerprint);
  });

  it('groups concurrent duplicate requests without losing occurrences', async () => {
    const payload = {
      message: `Concurrent duplicate ${randomUUID()}`,
      stackTrace: 'at write (src/concurrent.ts:6:2)',
      severity: IssueSeverity.CRITICAL,
      environment: 'production',
    };
    const responses = await Promise.all(
      Array.from({ length: 12 }, () => ingest(apiKey, payload).expect(201)),
    );
    const issueIds = new Set(responses.map((response) => response.body.issueId));
    expect(issueIds.size).toBe(1);
    expect(responses.map((response) => response.body.eventId)).toHaveLength(12);

    const issue = await dataSource
      .getRepository(Issue)
      .findOneByOrFail({ id: responses[0].body.issueId as string });
    expect(issue.eventCount).toBe(12);
  }, 20_000);

  it('supports authorized search, pagination, assignment, comments, and resolve/reopen history', async () => {
    const queryTerm = `searchable-${randomUUID()}`;
    const created = await ingest(apiKey, {
      message: `Issue ${queryTerm}`,
      severity: IssueSeverity.ERROR,
      environment: 'staging',
    }).expect(201);
    const secondIssue = await ingest(apiKey, {
      message: `Issue ${queryTerm} second occurrence signature`,
      severity: IssueSeverity.ERROR,
      environment: 'staging',
    }).expect(201);

    const page = await request(app.getHttpServer())
      .get(`${API}/issues`)
      .query({
        projectId: project.id,
        search: queryTerm,
        status: IssueStatus.OPEN,
        severity: IssueSeverity.ERROR,
        environment: 'staging',
        page: 1,
        limit: 1,
        sort: 'eventCount',
        order: 'desc',
      })
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(page.body.pagination).toMatchObject({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    expect([created.body.issueId, secondIssue.body.issueId]).toContain(
      page.body.data[0].id,
    );
    await request(app.getHttpServer())
      .get(`${API}/issues/${created.body.issueId}`)
      .set('Authorization', `Bearer ${viewer.token}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`${API}/issues/${created.body.issueId}/status`)
      .set('Authorization', `Bearer ${viewer.token}`)
      .send({ status: IssueStatus.RESOLVED })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`${API}/issues/${created.body.issueId}/assignment`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ assigneeUserId: outsider.id })
      .expect(400);

    const assigned = await request(app.getHttpServer())
      .patch(`${API}/issues/${created.body.issueId}/assignment`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ assigneeUserId: member.id })
      .expect(200);
    expect(assigned.body.assigneeUserId).toBe(member.id);

    await request(app.getHttpServer())
      .patch(`${API}/issues/${created.body.issueId}/status`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: IssueStatus.RESOLVED })
      .expect(200)
      .expect(({ body }) => expect(body.resolvedAt).toBeTruthy());
    await request(app.getHttpServer())
      .patch(`${API}/issues/${created.body.issueId}/status`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: IssueStatus.OPEN })
      .expect(200)
      .expect(({ body }) => expect(body.resolvedAt).toBeNull());

    await request(app.getHttpServer())
      .post(`${API}/issues/${created.body.issueId}/comments`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ body: 'Investigated; password=do-not-store' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.body).not.toContain('do-not-store');
      });

    const details = await request(app.getHttpServer())
      .get(`${API}/issues/${created.body.issueId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(details.body.comments).toHaveLength(1);
    expect(details.body.activity.map((item: { action: string }) => item.action))
      .toEqual(expect.arrayContaining([
        'assignment_changed',
        'status_changed',
        'comment_added',
      ]));
  });

  it('rejects invalid credentials and payloads and blocks cross-organization reads', async () => {
    const payload = {
      message: `Validation ${randomUUID()}`,
      severity: IssueSeverity.INFO,
    };
    await request(app.getHttpServer())
      .post(`${API}/ingest/errors`)
      .send(payload)
      .expect(401);
    await ingest('not-a-valid-key', payload).expect(401);
    await ingest(apiKey, { ...payload, message: 'x'.repeat(2001) }).expect(400);
    await ingest(apiKey, { ...payload, projectId: secondProject.id }).expect(400);
    await ingest(apiKey, { ...payload, severity: 'fatal' }).expect(400);
    await ingest(apiKey, { ...payload, message: 'x'.repeat(70_000) })
      .expect(413)
      .expect(({ body }) => {
        expect(body.message).toBe('Request body is too large');
      });
    await request(app.getHttpServer())
      .post(`${API}/ingest/errors`)
      .set('Content-Type', 'application/json')
      .send('{"message":')
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toBe('Invalid JSON request body');
      });

    const foreign = await ingest(apiKey, payload).expect(201);
    await request(app.getHttpServer())
      .get(`${API}/issues/${foreign.body.issueId}`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${API}/issues`)
      .query({ projectId: project.id })
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(404);

    const newKey = await createApiKey(project.id);
    const apiKeyRecord = await dataSource
      .getRepository(ProjectApiKey)
      .findOneByOrFail({ keyHash: hashKey(newKey) });
    await request(app.getHttpServer())
      .delete(`${API}/projects/${project.id}/api-keys/${apiKeyRecord.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    await ingest(newKey, payload).expect(401);
  }, 20_000);

  it('evaluates critical and spike alerts, exposes notifications, and aggregates dashboard data', async () => {
    const criticalRule = await request(app.getHttpServer())
      .post(`${API}/organizations/${organizationId}/alert-rules`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Production critical errors',
        type: AlertRuleType.CRITICAL_ERROR,
        projectId: project.id,
        environment: AlertEnvironment.PRODUCTION,
        cooldownMinutes: 10,
      })
      .expect(201);
    expect(criticalRule.body.isEnabled).toBe(true);

    const spikeRule = await request(app.getHttpServer())
      .post(`${API}/organizations/${organizationId}/alert-rules`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Short error spike',
        type: AlertRuleType.ERROR_SPIKE,
        projectId: project.id,
        thresholdCount: 1,
        windowMinutes: 5,
        cooldownMinutes: 10,
      })
      .expect(201);
    expect(spikeRule.body.type).toBe(AlertRuleType.ERROR_SPIKE);

    const ingested = await ingest(apiKey, {
      message: `Phase eight alert ${randomUUID()}`,
      stackTrace: 'at checkout (src/checkout.ts:10:2)',
      severity: IssueSeverity.CRITICAL,
      environment: 'production',
      endpoint: '/checkout',
    }).expect(201);
    expect(ingested.body.notificationsCreated).toBe(6);
    await request(app.getHttpServer())
      .patch(`${API}/issues/${ingested.body.issueId}/status`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: IssueStatus.RESOLVED })
      .expect(200);
    const incident = await request(app.getHttpServer())
      .post(`${API}/organizations/${organizationId}/incidents`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        projectId: project.id,
        title: `Analytics incident ${randomUUID()}`,
      })
      .expect(201);

    const ownerNotifications = await request(app.getHttpServer())
      .get(`${API}/organizations/${organizationId}/notifications`)
      .query({ limit: 50 })
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(ownerNotifications.body.data).toHaveLength(2);
    expect(
      ownerNotifications.body.data.every(
        (item: { mockEmailStatus: string }) =>
          item.mockEmailStatus === 'simulated',
      ),
    ).toBe(true);

    const unread = await request(app.getHttpServer())
      .get(`${API}/organizations/${organizationId}/notifications/unread-count`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(unread.body.unreadCount).toBe(2);

    await request(app.getHttpServer())
      .patch(
        `${API}/organizations/${organizationId}/notifications/${ownerNotifications.body.data[0].id}/read`,
      )
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    const updatedUnread = await request(app.getHttpServer())
      .get(`${API}/organizations/${organizationId}/notifications/unread-count`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(updatedUnread.body.unreadCount).toBe(1);

    const from = new Date(Date.now() - 60 * 60_000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    const dashboard = await request(app.getHttpServer())
      .get(`${API}/organizations/${organizationId}/analytics/dashboard`)
      .query({ projectId: project.id, from, to, environment: 'production' })
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(dashboard.body.metrics.totalErrorEvents).toBeGreaterThan(0);
    expect(dashboard.body.resolutionTime.resolvedIssueCount).toBeGreaterThan(0);
    expect(dashboard.body.incidentTrend).toBeInstanceOf(Array);
    expect(dashboard.body.errorDistribution).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: IssueSeverity.CRITICAL }),
      ]),
    );
    expect(dashboard.body.topEndpoints).toEqual(
      expect.arrayContaining([expect.objectContaining({ endpoint: '/checkout' })]),
    );
    const incidentTime = new Date(incident.body.createdAt as string);
    const incidentDashboard = await request(app.getHttpServer())
      .get(`${API}/organizations/${organizationId}/analytics/dashboard`)
      .query({
        projectId: project.id,
        from: new Date(incidentTime.getTime() - 60_000).toISOString(),
        to: new Date(incidentTime.getTime() + 60_000).toISOString(),
      })
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(incidentDashboard.body.incidentTrend).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ incidentCount: 1 }),
      ]),
    );

    await request(app.getHttpServer())
      .post(`${API}/organizations/${organizationId}/alert-rules`)
      .set('Authorization', `Bearer ${viewer.token}`)
      .send({
        name: 'Unauthorized rule',
        type: AlertRuleType.CRITICAL_ERROR,
      })
      .expect(403);
    await request(app.getHttpServer())
      .get(`${API}/organizations/${organizationId}/analytics/dashboard`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(404);
  }, 30_000);

  async function registerUser() {
    const email = `phase6-${randomUUID()}@example.test`;
    emails.add(email);
    const response = await request(app.getHttpServer())
      .post(`${API}/auth/register`)
      .send({ name: 'Phase Six User', email, password: PASSWORD })
      .expect(201);
    return {
      id: response.body.user.id as string,
      email,
      token: response.body.accessToken as string,
    };
  }

  async function createProject(name: string) {
    const response = await request(app.getHttpServer())
      .post(`${API}/organizations/${organizationId}/projects`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name })
      .expect(201);
    return { id: response.body.id as string };
  }

  async function createApiKey(projectId: string) {
    const response = await request(app.getHttpServer())
      .post(`${API}/projects/${projectId}/api-keys`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Phase six test key' })
      .expect(201);
    return response.body.key as string;
  }

  function ingest(key: string, payload: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(`${API}/ingest/errors`)
      .set('x-api-key', key)
      .send(payload);
  }
});

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
