import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { UsersModule } from '../users/users.module.js';
import { OrganizationInvitation } from './organization-invitation.entity.js';
import { OrganizationMember } from './organization-member.entity.js';
import { Organization } from './organization.entity.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    TypeOrmModule.forFeature([
      Organization,
      OrganizationMember,
      OrganizationInvitation,
    ]),
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, JwtAuthGuard],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
