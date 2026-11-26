import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationMember } from '../organizations/organization-member.entity.js';
import { Project } from '../projects/project.entity.js';
import { UsersModule } from '../users/users.module.js';
import { Deployment } from './deployment.entity.js';
import { DeploymentsController } from './deployments.controller.js';
import { DeploymentsService } from './deployments.service.js';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    TypeOrmModule.forFeature([Deployment, Project, OrganizationMember]),
  ],
  controllers: [DeploymentsController],
  providers: [DeploymentsService, JwtAuthGuard],
})
export class DeploymentsModule {}
