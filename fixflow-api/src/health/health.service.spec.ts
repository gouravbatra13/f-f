import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  let healthService: HealthService;
  const query = vi.fn();

  beforeEach(async () => {
    query.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: DataSource, useValue: { query } },
      ],
    }).compile();

    healthService = module.get<HealthService>(HealthService);
  });

  it('reports the database as ready when the query succeeds', async () => {
    query.mockResolvedValue([{ result: 1 }]);

    await expect(healthService.checkDatabase()).resolves.toMatchObject({
      success: true,
      status: 'ready',
      checks: { database: 'ok' },
    });
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('returns a service-unavailable error when the database query fails', async () => {
    query.mockRejectedValue(new Error('connection refused'));

    await expect(healthService.checkDatabase()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
