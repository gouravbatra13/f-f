import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Issue } from '../issues/issue.entity.js';
import { OrganizationMember } from '../organizations/organization-member.entity.js';
import { Project } from '../projects/project.entity.js';
import { UsersModule } from '../users/users.module.js';
import { AlertRule } from './alert-rule.entity.js';
import { AlertsController } from './alerts.controller.js';
import { AlertsService } from './alerts.service.js';
import { Notification } from '../notifications/notification.entity.js';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    TypeOrmModule.forFeature([
      AlertRule,
      Notification,
      OrganizationMember,
      Project,
      Issue,
    ]),
  ],
  controllers: [AlertsController],
  providers: [AlertsService, JwtAuthGuard],
  exports: [AlertsService],
})
export class AlertsModule {}
