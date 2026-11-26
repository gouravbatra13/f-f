import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import { setMaxListeners } from 'node:events';
import { DataSource } from 'typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter.js';
import { bodyParserErrorHandler } from '../src/common/middleware/body-parser-error.handler.js';
import { DeploymentEnvironment } from '../src/deployments/deployment-environment.enum.js';
import { DeploymentStatus } from '../src/deployments/deployment-status.enum.js';
import { IncidentIssue } from '../src/incidents/incident-issue.entity.js';
import { IncidentSeverity } from '../src/incidents/incident-severity.enum.js';
import { IncidentStatus } from '../src/incidents/incident-status.enum.js';
import { IncidentTimeline } from '../src/incidents/incident-timeline.entity.js';
import { Organization } from '../src/organizations/organization.entity.js';
import { OrganizationRole } from '../src/organizations/organization-role.enum.js';
import { IssueSeverity } from '../src/issues/issue-severity.enum.js';
import { User } from '../src/users/user.entity.js';

const API = '/api/v1';
const PASSWORD = 'Strong-password-123!';

describe('Incident management and deployment monitoring (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let owner: { id: string; email: string; token: string };
  let developer: { id: string; email: string; token: string };
  let viewer: { id: string; email: string; token: string };
  let outsider: { id: string; email: string; token: string };
  let organizationId: string;
  let foreignOrganizationId: string;
  let projectId: string;
  let secondProjectId: string;
  let deploymentProjectId: string;
  let foreignProjectId: string;
  let apiKey: string;
  let deploymentApiKey: string;
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
    developer = await registerUser();
    viewer = await registerUser();
    outsider = await registerUser();
    organizationId = await createOrganization(owner.token, 'Phase Seven Team');
    foreignOrganizationId = await createOrganization(
      outsider.token,
      'Phase Seven Foreign Team',
    );
    await inviteAndAccept(
      organizationId,
      owner.token,
      developer,
      OrganizationRole.DEVELOPER,
    );
    await inviteAndAccept(
      organizationId,
      owner.token,
      viewer,
      OrganizationRole.VIEWER,
    );
    projectId = await createProject(organizationId, owner.token, 'Core API');
    secondProjectId = await createProject(
      organizationId,
      owner.token,
      'Worker API',
    );
    deploymentProjectId = await createProject(
      organizationId,
      owner.token,
      'Deployment Analysis API',
    );
    foreignProjectId = await createProject(
      foreignOrganizationId,
      outsider.token,
      'Foreign API',
    );
    apiKey = await createApiKey(projectId);
    deploymentApiKey = await createApiKey(deploymentProjectId);
  }, 45_000);

  afterAll(async () => {
    for (const id of [organizationId, foreignOrganizationId]) {
      if (id && dataSource) {
        await dataSource.getRepository(Organization).delete({ id });
      }
    }
    if (dataSource) {
      for (const email of emails) {
        await dataSource.getRepository(User).delete({ email });
      }
    }
    if (app) await app.close();
  });

  it('creates, searches, updates, resolves, reopens, and archives incidents', async () => {
    const searchTerm = `database-outage-${randomUUID()}`;
    const created = await request(app.getHttpServer())
      .post(`${API}/organizations/${organizationId}/incidents`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        projectId,
        title: `Database outage ${searchTerm}`,
        description: 'Connection pool exhaustion',
        severity: IncidentSeverity.SEV2,
        ownerUserId: developer.id,
      })
      .expect(201);
    const incidentId = created.body.id as string;
    expect(created.body).toMatchObject({
      organizationId,
      projectId,
      status: IncidentStatus.OPEN,
      severity: IncidentSeverity.SEV2,
      ownerUserId: developer.id,
    });

    const page = await request(app.getHttpServer())
      .get(`${API}/organizations/${organizationId}/incidents`)
      .query({
        search: searchTerm,
        status: IncidentStatus.OPEN,
        severity: IncidentSeverity.SEV2,
        projectId,
        page: 1,
        limit: 1,
      })
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(page.body.pagination).toMatchObject({
      page: 1,
      limit: 1,
      total: 1,
    });
    expect(page.body.data[0].id).toBe(incidentId);

    await request(app.getHttpServer())
      .get(`${API}/organizations/${organizationId}/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${viewer.token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${API}/organizations/${foreignOrganizationId}/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`${API}/organizations/${organizationId}/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${viewer.token}`)
      .send({ status: IncidentStatus.INVESTIGATING })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`${API}/organizations/${organizationId}/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ ownerUserId: outsider.id })
      .expect(400);

    const updated = await request(app.getHttpServer())
      .patch(`${API}/organizations/${organizationId}/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${developer.token}`)
      .send({
        title: `Investigating ${searchTerm}`,
        description: 'Investigating a recurring connection failure',
        severity: IncidentSeverity.SEV1,
        status: IncidentStatus.INVESTIGATING,
        ownerUserId: owner.id,
        resolutionNotes: 'Temporary mitigation password=not-stored',
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      title: `Investigating ${searchTerm}`,
      severity: IncidentSeverity.SEV1,
      status: IncidentStatus.INVESTIGATING,
      ownerUserId: owner.id,
      resolvedAt: null,
    });
    expect(updated.body.resolutionNotes).not.toContain('not-stored');

    const resolved = await request(app.getHttpServer())
      .patch(`${API}/organizations/${organizationId}/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        status: IncidentStatus.RESOLVED,
        resolutionNotes: 'Connections recovered; root cause remains under review.',
      })
      .expect(200);
    expect(resolved.body.resolvedAt).toBeTruthy();

    const reopened = await request(app.getHttpServer())
      .patch(`${API}/organizations/${organizationId}/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: IncidentStatus.MONITORING })
      .expect(200);
    expect(reopened.body.resolvedAt).toBeNull();

    const timeline = await request(app.getHttpServer())
      .get(`${API}/organizations/${organizationId}/incidents/${incidentId}/timeline`)
      .query({ page: 1, limit: 100 })
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    const actions = (timeline.body.data as { action: string }[]).map(
      (entry) => entry.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        'incident_created',
        'owner_assigned',
        'details_updated',
        'severity_changed',
        'status_changed',
        'resolution_notes_updated',
      ]),
    );
    const persistedTimeline = await dataSource
      .getRepository(IncidentTimeline)
      .find({ where: { incidentId } });
    expect(
      JSON.stringify(persistedTimeline).includes('not-stored'),
    ).toBe(false);

    await request(app.getHttpServer())
      .delete(`${API}/organizations/${organizationId}/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200)
      .expect(({ body }) => expect(body.archived).toBe(true));
    await request(app.getHttpServer())
      .get(`${API}/organizations/${organizationId}/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);
    expect(
      await dataSource
        .getRepository(IncidentTimeline)
        .count({ where: { incidentId } }),
    ).toBeGreaterThan(0);
  }, 20_000);

  it('links issues once under concurrency and enforces project and tenant boundaries', async () => {
    const incident = await createIncident(projectId, 'Linked issue incident');
    const linkedIssue = await ingestIssue(apiKey, {
      message: `linked-${randomUUID()}`,
      severity: IssueSeverity.ERROR,
      environment: 'production',
    });
    const issueId = linkedIssue.issueId;
    const attempts = await Promise.all(
      Array.from(
        { length: 8 },
        () => linkIssue(incident.id, issueId).expect(201),
      ),
    );
    expect(attempts.filter((result) => result.body.linked).length).toBe(1);
    expect(
      await dataSource
        .getRepository(IncidentIssue)
        .count({ where: { incidentId: incident.id, issueId } }),
    ).toBe(1);

    const otherProjectIssue = await ingestIssue(
      await createApiKey(secondProjectId),
      {
        message: `other-project-${randomUUID()}`,
        severity: IssueSeverity.WARNING,
      },
    );
    await linkIssue(incident.id, otherProjectIssue.issueId, owner.token).expect(400);

    const foreignIssue = await ingestIssue(
      await createApiKey(foreignProjectId, outsider.token),
      {
        message: `foreign-${randomUUID()}`,
        severity: IssueSeverity.ERROR,
      },
    );
    await linkIssue(incident.id, foreignIssue.issueId, owner.token).expect(404);
    await unlinkIssue(incident.id, issueId, viewer.token).expect(403);

    const unlinked = await unlinkIssue(incident.id, issueId).expect(200);
    expect(unlinked.body).toMatchObject({
      issueId,
      unlinked: true,
    });
    await unlinkIssue(incident.id, issueId).expect(200);
    expect(
      await dataSource
        .getRepository(IncidentTimeline)
        .count({ where: { incidentId: incident.id, action: 'issue_unlinked' } }),
    ).toBe(1);

    const details = await request(app.getHttpServer())
      .get(`${API}/organizations/${organizationId}/incidents/${incident.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(details.body.linkedIssues).toHaveLength(0);
  }, 30_000);

  it('records deployment status and compares environment-specific error evidence', async () => {
    const deployedAt = new Date(Date.now() - 20 * 60_000);
    const recurringMessage = `recurring-release-error-${randomUUID()}`;
    const recurringIssue = (await ingestIssue(deploymentApiKey, {
      message: recurringMessage,
      severity: IssueSeverity.WARNING,
      environment: 'production',
      timestamp: new Date(deployedAt.getTime() - 10 * 60_000).toISOString(),
    })).fingerprint;
    await ingestIssue(deploymentApiKey, {
      message: recurringMessage,
      severity: IssueSeverity.CRITICAL,
      environment: 'production',
      timestamp: new Date(deployedAt.getTime() + 5 * 60_000).toISOString(),
    });
    await ingestIssue(deploymentApiKey, {
      message: recurringMessage,
      severity: IssueSeverity.ERROR,
      environment: 'production',
      timestamp: new Date(deployedAt.getTime() + 6 * 60_000).toISOString(),
    });
    const newIssue = (await ingestIssue(deploymentApiKey, {
      message: `introduced-release-error-${randomUUID()}`,
      severity: IssueSeverity.CRITICAL,
      environment: 'production',
      timestamp: new Date(deployedAt.getTime() + 7 * 60_000).toISOString(),
    })).fingerprint;
    await ingestIssue(deploymentApiKey, {
      message: `staging-only-${randomUUID()}`,
      severity: IssueSeverity.CRITICAL,
      environment: 'staging',
      timestamp: new Date(deployedAt.getTime() + 8 * 60_000).toISOString(),
    });

    const created = await request(app.getHttpServer())
      .post(`${API}/projects/${deploymentProjectId}/deployments`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        environment: DeploymentEnvironment.PRODUCTION,
        release: '2026.11.12-rc1',
        deployedAt: deployedAt.toISOString(),
        commitHash: 'abcdef1234567',
        metadata: { workflow: 'release', password: 'should-not-persist' },
      })
      .expect(201);
    const deploymentId = created.body.id as string;
    expect(created.body).toMatchObject({
      status: DeploymentStatus.PENDING,
      environment: DeploymentEnvironment.PRODUCTION,
      projectId: deploymentProjectId,
    });
    expect(created.body.metadata).toEqual({ workflow: 'release' });

    await request(app.getHttpServer())
      .patch(`${API}/projects/${deploymentProjectId}/deployments/${deploymentId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: DeploymentStatus.IN_PROGRESS })
      .expect(200);
    const succeeded = await request(app.getHttpServer())
      .patch(`${API}/projects/${deploymentProjectId}/deployments/${deploymentId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: DeploymentStatus.SUCCESS })
      .expect(200);
    expect(succeeded.body.status).toBe(DeploymentStatus.SUCCESS);

    const page = await request(app.getHttpServer())
      .get(`${API}/projects/${deploymentProjectId}/deployments`)
      .query({
        environment: DeploymentEnvironment.PRODUCTION,
        status: DeploymentStatus.SUCCESS,
        search: '2026.11.12',
        page: 1,
        limit: 10,
      })
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(page.body.pagination.total).toBe(1);

    const impact = await request(app.getHttpServer())
      .get(`${API}/projects/${deploymentProjectId}/deployments/${deploymentId}/impact`)
      .query({ windowMinutes: 60 })
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(impact.body).toMatchObject({
      before: { eventCount: 1 },
      after: { eventCount: 3 },
      newFingerprintCount: 1,
      possibleRegression: true,
      percentageChangeBasis: 'events_per_minute',
    });
    expect(impact.body.percentageChange).toBeGreaterThan(0);
    expect(
      impact.body.newlyIntroducedFingerprints.map(
        (finding: { fingerprint: string }) => finding.fingerprint,
      ),
    ).toContain(newIssue);
    expect(
      impact.body.recurringFingerprints.map(
        (finding: { fingerprint: string }) => finding.fingerprint,
      ),
    ).toContain(recurringIssue);
    expect(impact.body.after.severityDistribution).toMatchObject({
      critical: 2,
      error: 1,
    });
    expect(impact.body.interpretation).toContain('possible correlation');
    expect(impact.body.interpretation).toContain(
      'not evidence that the deployment caused the errors',
    );

    await request(app.getHttpServer())
      .get(`${API}/projects/${deploymentProjectId}/deployments/${deploymentId}`)
      .set('Authorization', `Bearer ${viewer.token}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`${API}/projects/${deploymentProjectId}/deployments/${deploymentId}`)
      .set('Authorization', `Bearer ${viewer.token}`)
      .send({ status: DeploymentStatus.ROLLED_BACK })
      .expect(403);
    await request(app.getHttpServer())
      .get(`${API}/projects/${deploymentProjectId}/deployments/${deploymentId}`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${API}/projects/${foreignProjectId}/deployments/${deploymentId}`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${API}/projects/${deploymentProjectId}/deployments`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ environment: 'local', release: 'invalid' })
      .expect(400);

    await request(app.getHttpServer())
      .delete(`${API}/projects/${deploymentProjectId}/deployments/${deploymentId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${API}/projects/${deploymentProjectId}/deployments/${deploymentId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);
    const archived = await dataSource.query(
      'SELECT deleted_at FROM deployments WHERE id = ?',
      [deploymentId],
    );
    expect(archived[0].deleted_at).not.toBeNull();
  }, 30_000);

  async function registerUser() {
    const email = `phase7-${randomUUID()}@example.test`;
    emails.add(email);
    const response = await request(app.getHttpServer())
      .post(`${API}/auth/register`)
      .send({ name: 'Phase Seven User', email, password: PASSWORD })
      .expect(201);
    return {
      id: response.body.user.id as string,
      email,
      token: response.body.accessToken as string,
    };
  }

  async function createOrganization(token: string, name: string) {
    const response = await request(app.getHttpServer())
      .post(`${API}/organizations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name })
      .expect(201);
    return response.body.id as string;
  }

  async function inviteAndAccept(
    orgId: string,
    ownerToken: string,
    invitee: { email: string; token: string },
    role: OrganizationRole,
  ) {
    const invitation = await request(app.getHttpServer())
      .post(`${API}/organizations/${orgId}/invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: invitee.email, role })
      .expect(201);
    await request(app.getHttpServer())
      .post(`${API}/organizations/invitations/accept`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .send({ token: invitation.body.mockDelivery.acceptToken })
      .expect(201);
  }

  async function createProject(orgId: string, token: string, name: string) {
    const response = await request(app.getHttpServer())
      .post(`${API}/organizations/${orgId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name })
      .expect(201);
    return response.body.id as string;
  }

  async function createApiKey(project: string, token = owner.token) {
    const response = await request(app.getHttpServer())
      .post(`${API}/projects/${project}/api-keys`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Phase seven test key' })
      .expect(201);
    return response.body.key as string;
  }

  async function createIncident(project: string, title: string) {
    const response = await request(app.getHttpServer())
      .post(`${API}/organizations/${organizationId}/incidents`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ projectId: project, title })
      .expect(201);
    return response.body as { id: string };
  }

  function linkIssue(
    incidentId: string,
    issueId: string,
    token = owner.token,
  ) {
    return request(app.getHttpServer())
      .post(
        `${API}/organizations/${organizationId}/incidents/${incidentId}/issues`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ issueId });
  }

  function unlinkIssue(
    incidentId: string,
    issueId: string,
    token = owner.token,
  ) {
    return request(app.getHttpServer())
      .delete(
        `${API}/organizations/${organizationId}/incidents/${incidentId}/issues/${issueId}`,
      )
      .set('Authorization', `Bearer ${token}`);
  }

  async function ingestIssue(
    key: string,
    payload: {
      message: string;
      severity: IssueSeverity;
      environment?: string;
      timestamp?: string;
    },
  ): Promise<{ issueId: string; fingerprint: string }> {
    const response = await request(app.getHttpServer())
      .post(`${API}/ingest/errors`)
      .set('x-api-key', key)
      .send(payload)
      .expect(201);
    return {
      issueId: response.body.issueId as string,
      fingerprint: response.body.fingerprint as string,
    };
  }
});
