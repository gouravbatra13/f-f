import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AiJobQueueService } from '../ai/ai-job-queue.service.js';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  let healthService: HealthService;
  const query = vi.fn();
  const readiness = vi.fn();

  beforeEach(async () => {
    query.mockReset();
    readiness.mockReset().mockResolvedValue('disabled');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: DataSource, useValue: { query } },
        { provide: AiJobQueueService, useValue: { readiness } },
      ],
    }).compile();

    healthService = module.get<HealthService>(HealthService);
  });

  it('reports the database as ready when the query succeeds', async () => {
    query.mockResolvedValue([{ result: 1 }]);

    await expect(healthService.checkDatabase()).resolves.toMatchObject({
      success: true,
      status: 'ready',
      checks: { database: 'ok', queue: 'disabled' },
    });
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('returns a service-unavailable error when the database query fails', async () => {
    query.mockRejectedValue(new Error('connection refused'));

    await expect(healthService.checkDatabase()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('fails readiness when the configured Redis queue is unavailable', async () => {
    query.mockResolvedValue([{ result: 1 }]);
    readiness.mockRejectedValue(new Error('redis refused'));

    await expect(healthService.checkDatabase()).rejects.toThrow(
      'Background queue is unavailable',
    );
  });
});
