import {
  Body,
  Controller,
  InternalServerErrorException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { ProjectApiKeyGuard } from '../api-keys/project-api-key.guard.js';
import { IngestErrorDto } from './dto/ingest-error.dto.js';
import { ErrorEventsService } from './error-events.service.js';

type IngestionRequest = Request & {
  projectId?: string;
  projectApiKeyId?: string;
};

@Controller('ingest')
@UseGuards(ThrottlerGuard, ProjectApiKeyGuard)
export class ErrorEventsController {
  constructor(private readonly errorEvents: ErrorEventsService) {}

  @Post('errors')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  ingest(@Req() request: IngestionRequest, @Body() dto: IngestErrorDto) {
    if (!request.projectId || !request.projectApiKeyId) {
      throw new InternalServerErrorException(
        'Project API key guard did not populate project context',
      );
    }

    return this.errorEvents.ingest({
      projectId: request.projectId,
      apiKeyId: request.projectApiKeyId,
      dto,
    });
  }
}
