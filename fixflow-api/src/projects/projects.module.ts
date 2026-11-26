import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationMember } from '../organizations/organization-member.entity.js';
import { Organization } from '../organizations/organization.entity.js';
import { UsersModule } from '../users/users.module.js';
import { ProjectsController } from './projects.controller.js';
import { Project } from './project.entity.js';
import { ProjectsService } from './projects.service.js';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    TypeOrmModule.forFeature([Project, OrganizationMember, Organization]),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, JwtAuthGuard],
  exports: [ProjectsService],
})
export class ProjectsModule {}
