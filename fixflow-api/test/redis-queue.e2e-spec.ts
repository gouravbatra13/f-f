import { Queue, QueueEvents, Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';

const enabled = process.env.RUN_REDIS_QUEUE_TESTS === 'true';

describe.skipIf(!enabled)('BullMQ Redis integration', () => {
  const parsedUrl = new URL(
    process.env.REDIS_TEST_URL ?? 'redis://127.0.0.1:6379',
  );
  const connection = {
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port || 6379),
    ...(parsedUrl.password
      ? { password: decodeURIComponent(parsedUrl.password) }
      : {}),
  };
  const queueName = `fixflow-test-${randomUUID()}`;
  let queue: Queue;
  let events: QueueEvents;
  let worker: Worker;
  let attempts = 0;

  beforeAll(async () => {
    queue = new Queue(queueName, { connection });
    events = new QueueEvents(queueName, { connection });
    worker = new Worker(
      queueName,
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('intentional retry test');
        return { processed: true };
      },
      { connection },
    );
    await Promise.all([
      queue.waitUntilReady(),
      events.waitUntilReady(),
      worker.waitUntilReady(),
    ]);
  });

  afterAll(async () => {
    await worker?.close();
    await events?.close();
    await queue?.obliterate({ force: true });
    await queue?.close();
  });

  it('processes a failed job with exponential retry and stable job ID', async () => {
    const job = await queue.add(
      'retry-once',
      { sourceId: 'test-issue' },
      {
        jobId: 'retry-once',
        attempts: 3,
        backoff: { type: 'exponential', delay: 25 },
        removeOnComplete: false,
      },
    );

    await expect(job.waitUntilFinished(events, 10_000)).resolves.toEqual({
      processed: true,
    });
    expect(attempts).toBe(2);
    await expect(job.getState()).resolves.toBe('completed');

    const duplicate = await queue.add(
      'retry-once',
      { sourceId: 'test-issue' },
      { jobId: 'retry-once' },
    );
    expect(duplicate.id).toBe(job.id);
    expect(attempts).toBe(2);
  });
});
