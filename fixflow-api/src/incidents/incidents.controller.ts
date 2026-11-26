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
import { CreateIncidentDto } from './dto/create-incident.dto.js';
import { LinkIssueDto } from './dto/link-issue.dto.js';
import { ListIncidentsDto } from './dto/list-incidents.dto.js';
import { ListTimelineDto } from './dto/list-timeline.dto.js';
import { UpdateIncidentDto } from './dto/update-incident.dto.js';
import { IncidentsService } from './incidents.service.js';

@Controller('organizations/:organizationId/incidents')
@UseGuards(JwtAuthGuard)
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Post()
  create(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateIncidentDto,
  ) {
    return this.incidents.create(organizationId, user, dto);
  }

  @Get()
  list(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: ListIncidentsDto,
  ) {
    return this.incidents.list(organizationId, user.id, filters);
  }

  @Get(':incidentId/timeline')
  listTimeline(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() pagination: ListTimelineDto,
  ) {
    return this.incidents.listTimeline(
      organizationId,
      incidentId,
      user.id,
      pagination,
    );
  }

  @Get(':incidentId')
  get(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.incidents.getById(organizationId, incidentId, user.id);
  }

  @Patch(':incidentId')
  update(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateIncidentDto,
  ) {
    return this.incidents.update(organizationId, incidentId, user, dto);
  }

  @Delete(':incidentId')
  archive(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.incidents.archive(organizationId, incidentId, user);
  }

  @Post(':incidentId/issues')
  linkIssue(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LinkIssueDto,
  ) {
    return this.incidents.linkIssue(organizationId, incidentId, user, dto);
  }

  @Delete(':incidentId/issues/:issueId')
  unlinkIssue(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @Param('issueId') issueId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.incidents.unlinkIssue(
      organizationId,
      incidentId,
      issueId,
      user,
    );
  }
}
