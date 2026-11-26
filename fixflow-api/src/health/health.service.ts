import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AiJobQueueService } from '../ai/ai-job-queue.service.js';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly aiJobs: AiJobQueueService,
  ) {}

  async checkDatabase() {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      this.logger.error('Database readiness check failed');
      throw new ServiceUnavailableException('Database is unavailable');
    }

    let queue: 'disabled' | 'ok';
    try {
      queue = await this.aiJobs.readiness();
    } catch {
      this.logger.error('Background queue readiness check failed');
      throw new ServiceUnavailableException(
        'Background queue is unavailable',
      );
    }

    return {
      success: true,
      status: 'ready',
      checks: { database: 'ok', queue },
      timestamp: new Date().toISOString(),
    };
  }
}
