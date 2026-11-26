import {
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { AI_ANALYSIS_QUEUE, type AiAnalysisJobData } from './ai-job.types.js';

@Injectable()
export class AiJobQueueService {
  constructor(
    @Optional()
    @InjectQueue(AI_ANALYSIS_QUEUE)
    private readonly queue?: Queue<AiAnalysisJobData>,
  ) {}

  async enqueue(data: AiAnalysisJobData) {
    if (!this.queue) {
      throw new ServiceUnavailableException(
        'Background AI jobs are not enabled',
      );
    }

    const requestKey = createHash('sha256')
      .update(
        JSON.stringify([
          data.actorUserId,
          data.sourceType,
          data.sourceId,
          data.options,
        ]),
      )
      .digest('hex');
    const jobId = `ai-${requestKey}`;
    try {
      const job = await this.queue.add('analyze', data, {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { age: 86_400, count: 5_000 },
        removeOnFail: { age: 604_800, count: 10_000 },
      });
      return { jobId: job.id, status: await job.getState() };
    } catch {
      throw new ServiceUnavailableException(
        'The background job could not be queued',
      );
    }
  }

  async getStatus(jobId: string, actorUserId: string) {
    if (!this.queue || !/^ai-[a-f0-9]{64}$/.test(jobId)) {
      throw new NotFoundException('AI analysis job not found');
    }

    try {
      const job = await this.queue.getJob(jobId);
      if (!job || job.data.actorUserId !== actorUserId) {
        throw new NotFoundException('AI analysis job not found');
      }

      return { jobId, status: await job.getState() };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new ServiceUnavailableException(
        'Background job status is unavailable',
      );
    }
  }

  async readiness(): Promise<'disabled' | 'ok'> {
    if (!this.queue) return 'disabled';
    await this.counts();
    return 'ok';
  }

  async counts() {
    if (!this.queue) return null;
    return this.queue.getJobCounts(
      'wait',
      'active',
      'completed',
      'failed',
      'delayed',
    );
  }
}
