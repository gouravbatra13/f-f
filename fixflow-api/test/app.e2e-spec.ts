import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import cookieParser from 'cookie-parser';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { AppModule } from './../src/app.module.js';
import { User } from '../src/users/user.entity.js';
import { RefreshSession } from '../src/auth/refresh-session.entity.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    process.env.MYSQL_HOST ??= '127.0.0.1';
    process.env.MYSQL_PORT ??= '33316';
    process.env.MYSQL_USER ??= 'fixflow_test';
    process.env.MYSQL_PASSWORD ??= 'test-only-password';
    process.env.MYSQL_DATABASE ??= 'fixflow_test';
    process.env.ACCESS_TOKEN_SECRET ??=
      'test-only-secret-that-is-at-least-32-bytes-long';

    const userRepository = {
      findOne: vi.fn(),
      createQueryBuilder: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    const sessionRepository = {
      findOne: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    const mockDataSource = {
      entityMetadatas: [],
      options: { type: 'mysql' },
      query: vi.fn().mockResolvedValue([{ result: 1 }]),
      manager: {
        save: vi.fn(),
        update: vi.fn(),
        transaction: vi.fn(),
      },
      getRepository: vi.fn((entity: typeof User | typeof RefreshSession) =>
        entity === User ? userRepository : sessionRepository,
      ),
      createQueryRunner: vi.fn(),
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getDataSourceToken())
      .useValue(mockDataSource)
      .overrideProvider(getRepositoryToken(User))
      .useValue(userRepository)
      .overrideProvider(getRepositoryToken(RefreshSession))
      .useValue(sessionRepository)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  it('/api/v1 (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect('Hello World!');
  });

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          success: true,
          service: 'fixflow-api',
        });
        expect(body.timestamp).toBeTypeOf('string');
      });
  });

  it('/api/v1/health/ready (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          success: true,
          status: 'ready',
          checks: { database: 'ok' },
        });
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
