import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateDeploymentDto } from './dto/create-deployment.dto.js';
import { DeploymentImpactDto } from './dto/deployment-impact.dto.js';
import { ListDeploymentsDto } from './dto/list-deployments.dto.js';
import { UpdateDeploymentDto } from './dto/update-deployment.dto.js';
import { DeploymentsService } from './deployments.service.js';

@Controller('projects/:projectId/deployments')
@UseGuards(JwtAuthGuard)
export class DeploymentsController {
  constructor(private readonly deployments: DeploymentsService) {}

  @Post()
  create(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDeploymentDto,
  ) {
    return this.deployments.create(projectId, user.id, dto);
  }

  @Get()
  list(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: ListDeploymentsDto,
  ) {
    return this.deployments.list(projectId, user.id, filters);
  }

  @Get(':deploymentId/impact')
  compareImpact(
    @Param('projectId') projectId: string,
    @Param('deploymentId') deploymentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() options: DeploymentImpactDto,
  ) {
    return this.deployments.compareImpact(
      projectId,
      deploymentId,
      user.id,
      options,
    );
  }

  @Get(':deploymentId')
  get(
    @Param('projectId') projectId: string,
    @Param('deploymentId') deploymentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deployments.getById(projectId, deploymentId, user.id);
  }

  @Patch(':deploymentId')
  update(
    @Param('projectId') projectId: string,
    @Param('deploymentId') deploymentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateDeploymentDto,
  ) {
    return this.deployments.update(
      projectId,
      deploymentId,
      user.id,
      dto,
    );
  }

  @Delete(':deploymentId')
  archive(
    @Param('projectId') projectId: string,
    @Param('deploymentId') deploymentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deployments.archive(projectId, deploymentId, user.id);
  }
}
