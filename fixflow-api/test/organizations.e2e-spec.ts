import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { ProjectApiKeysService } from '../src/api-keys/project-api-keys.service.js';
import { Organization } from '../src/organizations/organization.entity.js';
import { OrganizationRole } from '../src/organizations/organization-role.enum.js';
import { User } from '../src/users/user.entity.js';

const API = '/api/v1';
const PASSWORD = 'Strong-password-123!';

describe('Organizations, projects, and API keys (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let apiKeys: ProjectApiKeysService;
  const emails = new Set<string>();
  const organizationIds = new Set<string>();

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
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    dataSource = app.get(DataSource);
    apiKeys = app.get(ProjectApiKeysService);
  });

  afterEach(async () => {
    for (const organizationId of organizationIds) {
      await dataSource
        .getRepository(Organization)
        .delete({ id: organizationId });
    }
    organizationIds.clear();

    for (const email of emails) {
      await dataSource.getRepository(User).delete({ email });
    }
    emails.clear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an organization with an owner membership and lists only accessible organizations', async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const organization = await createOrganization(owner.token, 'Platform Team');

    expect(organization).toMatchObject({
      name: 'Platform Team',
      currentUserRole: OrganizationRole.OWNER,
    });
    expect(organization.slug).toMatch(/^platform-team-/);
    await request(app.getHttpServer())
      .patch(`${API}/organizations/${organization.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Platform Engineering', slug: 'platform-engineering' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          name: 'Platform Engineering',
          slug: 'platform-engineering',
        });
      });
    const listed = await request(app.getHttpServer())
      .get(`${API}/organizations`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(listed.body.map((item: { id: string }) => item.id)).toContain(
      organization.id,
    );

    await request(app.getHttpServer())
      .get(`${API}/organizations/${organization.id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404);
  });

  it('invites a registered user, accepts the invite, and enforces email ownership', async () => {
    const owner = await registerUser();
    const invitee = await registerUser();
    const wrongUser = await registerUser();
    const organization = await createOrganization(owner.token, 'Invite Team');

    const invited = await request(app.getHttpServer())
      .post(`${API}/organizations/${organization.id}/invitations`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: invitee.email.toUpperCase(), role: OrganizationRole.DEVELOPER })
      .expect(201);
    expect(invited.body.invitation).not.toHaveProperty('tokenHash');
    expect(invited.body.mockDelivery.to).toBe(invitee.email);
    expect(invited.body.mockDelivery.acceptToken).toBeTypeOf('string');

    await request(app.getHttpServer())
      .post(`${API}/organizations/invitations/accept`)
      .set('Authorization', `Bearer ${wrongUser.token}`)
      .send({ token: invited.body.mockDelivery.acceptToken })
      .expect(404);

    await request(app.getHttpServer())
      .post(`${API}/organizations/invitations/accept`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .send({ token: invited.body.mockDelivery.acceptToken })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('accepted');
      });

    const members = await request(app.getHttpServer())
      .get(`${API}/organizations/${organization.id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(members.body).toHaveLength(2);
    expect(members.body[1]).not.toHaveProperty('passwordHash');
  });

  it('rejects invitations and prevents unauthorized membership role changes', async () => {
    const owner = await registerUser();
    const manager = await registerUser();
    const developer = await registerUser();
    const organization = await createOrganization(owner.token, 'Roles Team');

    const managerInvite = await invite(
      organization.id,
      owner.token,
      manager.email,
      OrganizationRole.MANAGER,
    );
    await acceptInvite(manager.token, managerInvite.token);

    const developerInvite = await invite(
      organization.id,
      owner.token,
      developer.email,
      OrganizationRole.DEVELOPER,
    );
    await acceptInvite(developer.token, developerInvite.token);

    const rejected = await invite(
      organization.id,
      owner.token,
      'reject-me@example.test',
      OrganizationRole.VIEWER,
    );
    const rejectUser = await registerUser('reject-me@example.test');
    await request(app.getHttpServer())
      .post(`${API}/organizations/invitations/reject`)
      .set('Authorization', `Bearer ${rejectUser.token}`)
      .send({ token: rejected.token })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('rejected');
      });

    await request(app.getHttpServer())
      .patch(
        `${API}/organizations/${organization.id}/members/${developer.user.id}/role`,
      )
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ role: OrganizationRole.VIEWER })
      .expect(403);

    const updated = await request(app.getHttpServer())
      .patch(
        `${API}/organizations/${organization.id}/members/${developer.user.id}/role`,
      )
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ role: OrganizationRole.VIEWER })
      .expect(200);
    expect(updated.body.role).toBe(OrganizationRole.VIEWER);

    await request(app.getHttpServer())
      .patch(
        `${API}/organizations/${organization.id}/members/${developer.user.id}/role`,
      )
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ role: OrganizationRole.OWNER })
      .expect(403);

    await request(app.getHttpServer())
      .delete(
        `${API}/organizations/${organization.id}/members/${developer.user.id}`,
      )
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    const remaining = await request(app.getHttpServer())
      .get(`${API}/organizations/${organization.id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(remaining.body).toHaveLength(2);
  }, 15_000);

  it('supports project CRUD, soft archival, and cross-organization IDOR denial', async () => {
    const owner = await registerUser();
    const outsider = await registerUser();
    const organization = await createOrganization(owner.token, 'Projects Team');
    const otherOrganization = await createOrganization(
      outsider.token,
      'Other Projects',
    );
    const project = await createProject(
      organization.id,
      owner.token,
      'API Service',
    );
    const foreignProject = await createProject(
      otherOrganization.id,
      outsider.token,
      'Private Service',
    );

    expect(project.identifier).toMatch(/^prj_[a-f0-9]{20}$/);
    await request(app.getHttpServer())
      .get(`${API}/projects/${foreignProject.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${API}/organizations/${otherOrganization.id}/projects`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);

    const updated = await request(app.getHttpServer())
      .patch(`${API}/projects/${project.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'API Service v2', description: 'Updated project' })
      .expect(200);
    expect(updated.body).toMatchObject({
      name: 'API Service v2',
      description: 'Updated project',
    });

    const listed = await request(app.getHttpServer())
      .get(`${API}/organizations/${organization.id}/projects`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(listed.body).toHaveLength(1);

    await request(app.getHttpServer())
      .delete(`${API}/projects/${project.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${API}/projects/${project.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);
  });

  it('creates, hashes, lists, rotates, validates, and revokes project API keys', async () => {
    const owner = await registerUser();
    const organization = await createOrganization(owner.token, 'Keys Team');
    const project = await createProject(
      organization.id,
      owner.token,
      'Ingestion Service',
    );

    const created = await request(app.getHttpServer())
      .post(`${API}/projects/${project.id}/api-keys`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Production ingestion' })
      .expect(201);
    expect(created.body.key).toMatch(/^ffk_live_[A-Za-z0-9_-]{40,}$/);
    expect(created.body).not.toHaveProperty('keyHash');

    const rows = await dataSource.query(
      'SELECT key_hash, last_used_at FROM project_api_keys WHERE id = ?',
      [created.body.id],
    );
    expect(rows[0].key_hash).toBe(
      createHash('sha256').update(created.body.key).digest('hex'),
    );
    expect(rows[0].key_hash).not.toBe(created.body.key);
    await expect(apiKeys.validate(created.body.key)).resolves.toMatchObject({
      projectId: project.id,
      apiKeyId: created.body.id,
    });
    const usedKey = await dataSource.query(
      'SELECT last_used_at FROM project_api_keys WHERE id = ?',
      [created.body.id],
    );
    expect(usedKey[0].last_used_at).not.toBeNull();

    const listed = await request(app.getHttpServer())
      .get(`${API}/projects/${project.id}/api-keys`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(listed.body[0]).not.toHaveProperty('key');
    expect(listed.body[0]).not.toHaveProperty('keyHash');

    const rotated = await request(app.getHttpServer())
      .post(`${API}/projects/${project.id}/api-keys/${created.body.id}/rotate`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(201);
    await expect(apiKeys.validate(created.body.key)).rejects.toThrow();
    await expect(apiKeys.validate(rotated.body.key)).resolves.toMatchObject({
      apiKeyId: rotated.body.id,
    });

    await request(app.getHttpServer())
      .delete(`${API}/projects/${project.id}/api-keys/${rotated.body.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    await expect(apiKeys.validate(rotated.body.key)).rejects.toThrow();
  });

  it('denies project creation and API key management to organization viewers', async () => {
    const owner = await registerUser();
    const viewer = await registerUser();
    const organization = await createOrganization(owner.token, 'Read Only Team');
    const invitation = await invite(
      organization.id,
      owner.token,
      viewer.email,
      OrganizationRole.VIEWER,
    );
    await acceptInvite(viewer.token, invitation.token);

    await request(app.getHttpServer())
      .post(`${API}/organizations/${organization.id}/projects`)
      .set('Authorization', `Bearer ${viewer.token}`)
      .send({ name: 'Forbidden Project' })
      .expect(403);

    const project = await createProject(
      organization.id,
      owner.token,
      'Allowed Project',
    );
    await request(app.getHttpServer())
      .post(`${API}/projects/${project.id}/api-keys`)
      .set('Authorization', `Bearer ${viewer.token}`)
      .send({ name: 'Forbidden key' })
      .expect(403);
  });

  async function registerUser(email?: string) {
    const accountEmail = email ?? `phase5-${randomUUID()}@example.test`;
    emails.add(accountEmail);
    const response = await request(app.getHttpServer())
      .post(`${API}/auth/register`)
      .send({
        name: 'Phase Five User',
        email: accountEmail,
        password: PASSWORD,
      })
      .expect(201);
    return {
      email: accountEmail,
      token: response.body.accessToken as string,
      user: response.body.user as { id: string; email: string },
    };
  }

  async function createOrganization(token: string, name: string) {
    const response = await request(app.getHttpServer())
      .post(`${API}/organizations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name })
      .expect(201);
    organizationIds.add(response.body.id as string);
    return response.body as {
      id: string;
      name: string;
      slug: string;
      currentUserRole: OrganizationRole;
    };
  }

  async function invite(
    organizationId: string,
    token: string,
    email: string,
    role: OrganizationRole,
  ) {
    const response = await request(app.getHttpServer())
      .post(`${API}/organizations/${organizationId}/invitations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email, role })
      .expect(201);
    return {
      id: response.body.invitation.id as string,
      token: response.body.mockDelivery.acceptToken as string,
    };
  }

  async function acceptInvite(token: string, invitationToken: string) {
    return request(app.getHttpServer())
      .post(`${API}/organizations/invitations/accept`)
      .set('Authorization', `Bearer ${token}`)
      .send({ token: invitationToken })
      .expect(201);
  }

  async function createProject(
    organizationId: string,
    token: string,
    name: string,
  ) {
    const response = await request(app.getHttpServer())
      .post(`${API}/organizations/${organizationId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name })
      .expect(201);
    return response.body as { id: string; identifier: string };
  }
});
