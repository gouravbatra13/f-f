import type { AiService } from './ai.service.js';
import type { AiAnalysisJobData } from './ai-job.types.js';
import { AiAnalysisWorker } from './ai-analysis.worker.js';

describe('AiAnalysisWorker', () => {
  it('uses a stable investigation ID when BullMQ retries the same job', async () => {
    const analyzeIssue = vi.fn().mockResolvedValue(undefined);
    const worker = new AiAnalysisWorker({
      analyzeIssue,
      analyzeIncident: vi.fn(),
    } as unknown as AiService);
    const job = {
      id: 'ai-test-job',
      name: 'analyze',
      data: {
        actorUserId: 'user-1',
        sourceId: 'issue-1',
        sourceType: 'issue',
        options: { limit: 3 },
      } satisfies AiAnalysisJobData,
    };

    await worker.process(job as never);
    await worker.process(job as never);

    expect(analyzeIssue).toHaveBeenCalledTimes(2);
    expect(analyzeIssue.mock.calls[0]).toEqual(analyzeIssue.mock.calls[1]);
    expect(analyzeIssue.mock.calls[0][3]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
