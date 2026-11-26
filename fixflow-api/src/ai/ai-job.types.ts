import type { AnalyzeDto } from './dto/analyze.dto.js';

export const AI_ANALYSIS_QUEUE = 'ai-investigations';

export interface AiAnalysisJobData {
  actorUserId: string;
  sourceId: string;
  sourceType: 'issue' | 'incident';
  options: AnalyzeDto;
}
