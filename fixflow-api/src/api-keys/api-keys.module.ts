import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationMember } from '../organizations/organization-member.entity.js';
import { Project } from '../projects/project.entity.js';
import { ProjectApiKey } from '../projects/project-api-key.entity.js';
import { UsersModule } from '../users/users.module.js';
import { ProjectApiKeysController } from './project-api-keys.controller.js';
import { ProjectApiKeyGuard } from './project-api-key.guard.js';
import { ProjectApiKeysService } from './project-api-keys.service.js';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    TypeOrmModule.forFeature([ProjectApiKey, Project, OrganizationMember]),
  ],
  controllers: [ProjectApiKeysController],
  providers: [ProjectApiKeysService, ProjectApiKeyGuard, JwtAuthGuard],
  exports: [ProjectApiKeysService, ProjectApiKeyGuard],
})
export class ApiKeysModule {}
