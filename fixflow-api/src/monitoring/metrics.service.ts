import { Injectable, Optional } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';
import { AiJobQueueService } from '../ai/ai-job-queue.service.js';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly requestCount: Counter<'method' | 'route' | 'status_code'>;
  private readonly requestDuration: Histogram<
    'method' | 'route' | 'status_code'
  >;
  private readonly queueCount: Gauge<'state'>;

  constructor(@Optional() private readonly aiJobs?: AiJobQueueService) {
    this.registry.setDefaultLabels({ service: 'fixflow-api' });
    collectDefaultMetrics({ register: this.registry, prefix: 'fixflow_' });
    this.requestCount = new Counter({
      name: 'fixflow_http_requests_total',
      help: 'Completed API requests.',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });
    this.requestDuration = new Histogram({
      name: 'fixflow_http_request_duration_seconds',
      help: 'API request duration in seconds.',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });
    this.queueCount = new Gauge({
      name: 'fixflow_ai_jobs_count',
      help: 'Current AI analysis jobs by BullMQ state.',
      labelNames: ['state'],
      registers: [this.registry],
    });
  }

  recordRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ): void {
    const labels = {
      method,
      route,
      status_code: String(statusCode),
    };
    this.requestCount.inc(labels);
    this.requestDuration.observe(labels, durationSeconds);
  }

  async render(): Promise<{ contentType: string; body: string }> {
    const counts = await this.aiJobs?.counts();
    for (const [state, value] of Object.entries({
      waiting: counts?.wait ?? 0,
      active: counts?.active ?? 0,
      completed: counts?.completed ?? 0,
      failed: counts?.failed ?? 0,
      delayed: counts?.delayed ?? 0,
    })) {
      this.queueCount.labels(state).set(value);
    }

    return {
      contentType: this.registry.contentType,
      body: await this.registry.metrics(),
    };
  }
}
