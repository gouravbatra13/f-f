import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Deployment } from '../deployments/deployment.entity.js';
import { ErrorEvent } from '../issues/error-event.entity.js';
import { Incident } from '../incidents/incident.entity.js';
import { IncidentTimeline } from '../incidents/incident-timeline.entity.js';
import { Issue } from '../issues/issue.entity.js';
import { OrganizationMember } from '../organizations/organization-member.entity.js';
import { Project } from '../projects/project.entity.js';
import { UsersModule } from '../users/users.module.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    TypeOrmModule.forFeature([
      Deployment,
      ErrorEvent,
      Incident,
      IncidentTimeline,
      Issue,
      OrganizationMember,
      Project,
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, JwtAuthGuard],
})
export class AnalyticsModule {}
