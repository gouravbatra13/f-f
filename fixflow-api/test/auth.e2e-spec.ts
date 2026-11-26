import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { User } from '../src/users/user.entity.js';
import { UserRole } from '../src/users/user-role.enum.js';

const API = '/api/v1/auth';
const PASSWORD = 'Strong-password-123!';

function refreshCookie(response: request.Response): string {
  const setCookie = response.headers['set-cookie'] as string[] | undefined;
  const cookie = setCookie?.find((value) =>
    value.startsWith('fixflow_refresh='),
  );
  if (!cookie) {
    throw new Error('Refresh cookie was not set');
  }

  return cookie.split(';', 1)[0];
}

describe('Authentication API (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let testEmail: string;

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
  });

  beforeEach(() => {
    testEmail = `phase4-${crypto.randomUUID()}@example.test`;
  });

  afterEach(async () => {
    await dataSource.getRepository(User).delete({ email: testEmail });
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a developer, hashes the password, and returns a secure cookie only', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/register`)
      .send({
        name: 'Test Engineer',
        email: testEmail,
        password: PASSWORD,
      })
      .expect(201);

    expect(response.body.user).toMatchObject({
      email: testEmail,
      name: 'Test Engineer',
      role: 'developer',
    });
    expect(response.body).not.toHaveProperty('refreshToken');
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(response.headers['set-cookie'][0]).toContain('SameSite=Lax');

    const storedUser = await dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: testEmail })
      .getOneOrFail();
    expect(storedUser.passwordHash).not.toBe(PASSWORD);
    expect(storedUser.passwordHash).toMatch(/^\$2[aby]\$/);

    const rows = await dataSource.query(
      'SELECT token_hash FROM refresh_sessions WHERE user_id = ?',
      [storedUser.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(rows[0].token_hash).not.toBe(refreshCookie(response).split('=')[1]);
  });

  it('rejects duplicate email registration with 409', async () => {
    const payload = {
      name: 'Test Engineer',
      email: testEmail,
      password: PASSWORD,
    };
    await request(app.getHttpServer())
      .post(`${API}/register`)
      .send(payload)
      .expect(201);
    await request(app.getHttpServer())
      .post(`${API}/register`)
      .send(payload)
      .expect(409);
  });

  it('logs in with a correct password and rejects an incorrect password', async () => {
    await request(app.getHttpServer())
      .post(`${API}/register`)
      .send({
        name: 'Test Engineer',
        email: testEmail,
        password: PASSWORD,
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post(`${API}/login`)
      .send({ email: testEmail, password: PASSWORD })
      .expect(200);
    expect(login.body.accessToken).toBeTypeOf('string');

    await request(app.getHttpServer())
      .post(`${API}/login`)
      .send({ email: testEmail, password: 'incorrect-password' })
      .expect(401);
  });

  it('protects the profile endpoint from missing and invalid access tokens', async () => {
    await request(app.getHttpServer()).get(`${API}/me`).expect(401);
    await request(app.getHttpServer())
      .get(`${API}/me`)
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);

    const registration = await request(app.getHttpServer())
      .post(`${API}/register`)
      .send({
        name: 'Test Engineer',
        email: testEmail,
        password: PASSWORD,
      })
      .expect(201);

    const profile = await request(app.getHttpServer())
      .get(`${API}/me`)
      .set('Authorization', `Bearer ${registration.body.accessToken}`)
      .expect(200);
    expect(profile.body).toMatchObject({ email: testEmail, role: 'developer' });
    expect(profile.body).not.toHaveProperty('passwordHash');
  });

  it('rotates refresh tokens and revokes only the reused device session family', async () => {
    const registration = await request(app.getHttpServer())
      .post(`${API}/register`)
      .send({
        name: 'Test Engineer',
        email: testEmail,
        password: PASSWORD,
      })
      .expect(201);
    const oldCookie = refreshCookie(registration);
    const secondDevice = await request(app.getHttpServer())
      .post(`${API}/login`)
      .send({ email: testEmail, password: PASSWORD })
      .expect(200);

    const rotated = await request(app.getHttpServer())
      .post(`${API}/refresh`)
      .set('Cookie', oldCookie)
      .expect(200);
    const newCookie = refreshCookie(rotated);
    expect(newCookie).not.toBe(oldCookie);

    await request(app.getHttpServer())
      .post(`${API}/refresh`)
      .set('Cookie', oldCookie)
      .expect(401);
    await request(app.getHttpServer())
      .post(`${API}/refresh`)
      .set('Cookie', newCookie)
      .expect(401);
    await request(app.getHttpServer())
      .get(`${API}/me`)
      .set('Authorization', `Bearer ${rotated.body.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`${API}/me`)
      .set('Authorization', `Bearer ${secondDevice.body.accessToken}`)
      .expect(200);
  });

  it('serializes concurrent refresh attempts and invalidates the reused family', async () => {
    const registration = await request(app.getHttpServer())
      .post(`${API}/register`)
      .send({
        name: 'Test Engineer',
        email: testEmail,
        password: PASSWORD,
      })
      .expect(201);
    const cookie = refreshCookie(registration);

    const attempts = await Promise.all([
      request(app.getHttpServer()).post(`${API}/refresh`).set('Cookie', cookie),
      request(app.getHttpServer()).post(`${API}/refresh`).set('Cookie', cookie),
    ]);

    expect(attempts.map(({ status }) => status).sort()).toEqual([200, 401]);
    await request(app.getHttpServer())
      .get(`${API}/me`)
      .set('Authorization', `Bearer ${registration.body.accessToken}`)
      .expect(401);
  });

  it('logs out, revokes refresh sessions, and invalidates outstanding access tokens', async () => {
    const registration = await request(app.getHttpServer())
      .post(`${API}/register`)
      .send({
        name: 'Test Engineer',
        email: testEmail,
        password: PASSWORD,
      })
      .expect(201);
    const cookie = refreshCookie(registration);

    await request(app.getHttpServer())
      .post(`${API}/logout`)
      .set('Authorization', `Bearer ${registration.body.accessToken}`)
      .set('Cookie', cookie)
      .expect(204);
    await request(app.getHttpServer())
      .get(`${API}/me`)
      .set('Authorization', `Bearer ${registration.body.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post(`${API}/refresh`)
      .set('Cookie', cookie)
      .expect(401);
  });

  it('enforces member/admin role authorization using the persisted role', async () => {
    const registration = await request(app.getHttpServer())
      .post(`${API}/register`)
      .send({
        name: 'Test Engineer',
        email: testEmail,
        password: PASSWORD,
      })
      .expect(201);
    const accessToken = registration.body.accessToken as string;

    await request(app.getHttpServer())
      .get(`${API}/admin`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    await dataSource
      .getRepository(User)
      .update({ email: testEmail }, { role: UserRole.ADMIN });
    const adminResponse = await request(app.getHttpServer())
      .get(`${API}/admin`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(adminResponse.body.role).toBe('admin');
  });

  it('validates registration fields and rejects client-supplied roles', async () => {
    await request(app.getHttpServer())
      .post(`${API}/register`)
      .send({ name: 'Test', email: 'not-an-email', password: 'short' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`${API}/register`)
      .send({
        name: 'Test Engineer',
        email: testEmail,
        password: 'lowercase-only-123',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(`${API}/register`)
      .send({
        name: 'Test Engineer',
        email: testEmail,
        password: PASSWORD,
        role: 'admin',
      })
      .expect(400);
  });

  it('rejects cookie-setting auth requests from untrusted browser origins', async () => {
    await request(app.getHttpServer())
      .post(`${API}/login`)
      .set('Origin', 'https://untrusted.example')
      .send({ email: testEmail, password: PASSWORD })
      .expect(403);
  });
});
