import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AnalyzeDto } from './dto/analyze.dto.js';
import { KnowledgeSearchDto } from './dto/knowledge-search.dto.js';
import { AiService } from './ai.service.js';

@Controller('ai')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('health')
  health() {
    return this.ai.health();
  }

  @Post('issues/:issueId/analyze')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  analyzeIssue(
    @Param('issueId') issueId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() options: AnalyzeDto,
  ) {
    return this.ai.analyzeIssue(issueId, user.id, options);
  }

  @Post('issues/:issueId/analysis-jobs')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  enqueueIssueAnalysis(
    @Param('issueId') issueId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() options: AnalyzeDto,
  ) {
    return this.ai.enqueueIssueAnalysis(issueId, user.id, options);
  }

  @Post('incidents/:incidentId/analysis-jobs')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  enqueueIncidentAnalysis(
    @Param('incidentId') incidentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() options: AnalyzeDto,
  ) {
    return this.ai.enqueueIncidentAnalysis(incidentId, user.id, options);
  }

  @Get('analysis-jobs/:jobId')
  analysisJobStatus(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ai.getAnalysisJobStatus(jobId, user.id);
  }

  @Get('issues/:issueId/analysis/latest')
  latestIssueAnalysis(
    @Param('issueId') issueId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ai.getLatestIssueAnalysis(issueId, user.id);
  }

  @Get('issues/:issueId/similar')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  similarIssues(
    @Param('issueId') issueId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() options: AnalyzeDto,
  ) {
    return this.ai.getSimilarIssues(issueId, user.id, options);
  }

  @Post('incidents/:incidentId/analyze')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  analyzeIncident(
    @Param('incidentId') incidentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() options: AnalyzeDto,
  ) {
    return this.ai.analyzeIncident(incidentId, user.id, options);
  }

  @Get('incidents/:incidentId/summary')
  incidentSummary(
    @Param('incidentId') incidentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ai.getIncidentSummary(incidentId, user.id);
  }

  @Post('knowledge/search')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  searchKnowledge(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: KnowledgeSearchDto,
  ) {
    return this.ai.searchKnowledge(user.id, dto);
  }
}
