import { ServiceUnavailableException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AiJobQueueService } from './ai-job-queue.service.js';
import type { AiAnalysisJobData } from './ai-job.types.js';

describe('AiJobQueueService', () => {
  it('uses stable job IDs, bounded exponential retries, and excludes context', async () => {
    const job = { id: 'ai-test', getState: vi.fn().mockResolvedValue('waiting') };
    const queue = { add: vi.fn().mockResolvedValue(job) };
    const service = new AiJobQueueService(
      queue as unknown as Queue<AiAnalysisJobData>,
    );
    const data: AiAnalysisJobData = {
      actorUserId: 'user-1',
      sourceId: 'issue-1',
      sourceType: 'issue',
      options: { limit: 3 },
    };

    const first = await service.enqueue(data);
    const second = await service.enqueue(data);

    expect(first).toEqual({ jobId: 'ai-test', status: 'waiting' });
    expect(second.jobId).toBe(first.jobId);
    expect(queue.add).toHaveBeenCalledWith(
      'analyze',
      data,
      expect.objectContaining({
        jobId: expect.stringMatching(/^ai-[a-f0-9]{64}$/),
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
      }),
    );
  });

  it('fails explicitly when Redis-backed jobs are disabled', async () => {
    const service = new AiJobQueueService();
    await expect(
      service.enqueue({
        actorUserId: 'user-1',
        sourceId: 'issue-1',
        sourceType: 'issue',
        options: {},
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('does not disclose job status to another user', async () => {
    const queue = {
      getJob: vi.fn().mockResolvedValue({
        data: { actorUserId: 'user-1' },
      }),
    };
    const service = new AiJobQueueService(
      queue as unknown as Queue<AiAnalysisJobData>,
    );

    await expect(
      service.getStatus(`ai-${'a'.repeat(64)}`, 'user-2'),
    ).rejects.toThrow('AI analysis job not found');
  });
});
