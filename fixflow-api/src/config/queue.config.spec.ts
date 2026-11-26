import { getQueueConfig } from './queue.config.js';

describe('getQueueConfig', () => {
  it('keeps background queues disabled by default', () => {
    expect(getQueueConfig({}).enabled).toBe(false);
  });

  it('validates Redis settings and worker concurrency when enabled', () => {
    expect(
      getQueueConfig({
        QUEUE_ENABLED: 'true',
        REDIS_HOST: 'redis',
        REDIS_PORT: '6380',
        AI_WORKER_CONCURRENCY: '4',
      }),
    ).toMatchObject({
      enabled: true,
      host: 'redis',
      port: 6380,
      concurrency: 4,
    });
  });

  it('requires Redis authentication in production', () => {
    expect(() =>
      getQueueConfig({
        NODE_ENV: 'production',
        QUEUE_ENABLED: 'true',
        REDIS_HOST: 'redis',
      }),
    ).toThrow('REDIS_PASSWORD is required');
  });
});
