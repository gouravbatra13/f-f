import { MetricsService } from './metrics.service.js';

describe('MetricsService', () => {
  it('exports bounded route labels and request duration metrics', async () => {
    const service = new MetricsService();
    service.recordRequest('GET', '/health/ready', 200, 0.025);

    const metrics = await service.render();
    expect(metrics.contentType).toContain('text/plain');
    expect(metrics.body).toContain('fixflow_http_requests_total');
    expect(metrics.body).toContain('route="/health/ready"');
    expect(metrics.body).toContain('fixflow_http_request_duration_seconds');
  });
});
