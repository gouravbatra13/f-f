import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationMember } from '../organizations/organization-member.entity.js';
import { UsersModule } from '../users/users.module.js';
import { ErrorEvent } from './error-event.entity.js';
import { IssueActivityLog } from './issue-activity-log.entity.js';
import { IssueComment } from './issue-comment.entity.js';
import { Issue } from './issue.entity.js';
import { IssuesController } from './issues.controller.js';
import { IssuesService } from './issues.service.js';
import { Project } from '../projects/project.entity.js';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    TypeOrmModule.forFeature([
      Issue,
      ErrorEvent,
      IssueComment,
      IssueActivityLog,
      Project,
      OrganizationMember,
    ]),
  ],
  controllers: [IssuesController],
  providers: [IssuesService, JwtAuthGuard],
})
export class IssuesModule {}
