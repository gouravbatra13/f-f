import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { createHash } from 'node:crypto';
import { getQueueConfig } from '../config/queue.config.js';
import { AI_ANALYSIS_QUEUE, type AiAnalysisJobData } from './ai-job.types.js';
import { AiService } from './ai.service.js';

@Processor(AI_ANALYSIS_QUEUE, {
  concurrency: getQueueConfig().concurrency,
  lockDuration:
    Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 120_000) + 60_000,
  maxStalledCount: 1,
})
export class AiAnalysisWorker extends WorkerHost {
  constructor(private readonly aiService: AiService) {
    super();
  }

  async process(job: Job<AiAnalysisJobData>): Promise<void> {
    if (job.name !== 'analyze') {
      throw new Error('Unsupported AI analysis job');
    }

    const { actorUserId, sourceId, sourceType, options } = job.data;
    if (!job.id) throw new Error('AI analysis job ID is missing');
    const bytes = createHash('sha256').update(job.id).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    const investigationId = [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join('-');
    if (sourceType === 'issue') {
      await this.aiService.analyzeIssue(
        sourceId,
        actorUserId,
        options,
        investigationId,
      );
      return;
    }
    if (sourceType === 'incident') {
      await this.aiService.analyzeIncident(
        sourceId,
        actorUserId,
        options,
        investigationId,
      );
      return;
    }
    throw new Error('Unsupported AI analysis source');
  }
}
