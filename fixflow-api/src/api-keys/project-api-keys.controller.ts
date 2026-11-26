import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateApiKeyDto } from '../projects/dto/create-api-key.dto.js';
import { ProjectApiKeysService } from './project-api-keys.service.js';

@Controller('projects/:projectId/api-keys')
@UseGuards(JwtAuthGuard)
export class ProjectApiKeysController {
  constructor(private readonly apiKeys: ProjectApiKeysService) {}

  @Post()
  create(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.apiKeys.create(projectId, user.id, dto);
  }

  @Get()
  list(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.apiKeys.list(projectId, user.id);
  }

  @Post(':keyId/rotate')
  rotate(
    @Param('projectId') projectId: string,
    @Param('keyId') keyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.apiKeys.rotate(projectId, keyId, user.id);
  }

  @Delete(':keyId')
  revoke(
    @Param('projectId') projectId: string,
    @Param('keyId') keyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.apiKeys.revoke(projectId, keyId, user.id);
  }
}
