import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationMember } from '../organizations/organization-member.entity.js';
import { Issue } from '../issues/issue.entity.js';
import { Project } from '../projects/project.entity.js';
import { UsersModule } from '../users/users.module.js';
import { IncidentIssue } from './incident-issue.entity.js';
import { Incident } from './incident.entity.js';
import { IncidentTimeline } from './incident-timeline.entity.js';
import { IncidentsController } from './incidents.controller.js';
import { IncidentsService } from './incidents.service.js';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    TypeOrmModule.forFeature([
      Incident,
      IncidentIssue,
      IncidentTimeline,
      OrganizationMember,
      Project,
      Issue,
    ]),
  ],
  controllers: [IncidentsController],
  providers: [IncidentsService, JwtAuthGuard],
})
export class IncidentsModule {}
