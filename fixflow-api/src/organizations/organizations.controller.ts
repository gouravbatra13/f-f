import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateOrganizationDto } from './dto/create-organization.dto.js';
import { InviteMemberDto } from './dto/invite-member.dto.js';
import { RespondInvitationDto } from './dto/respond-invitation.dto.js';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto.js';
import { UpdateOrganizationDto } from './dto/update-organization.dto.js';
import { OrganizationsService } from './organizations.service.js';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.organizations.create(dto, user);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.organizations.listForUser(user.id);
  }

  @Get(':organizationId')
  get(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizations.getById(organizationId, user.id);
  }

  @Patch(':organizationId')
  update(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizations.update(organizationId, user.id, dto);
  }

  @Get(':organizationId/members')
  listMembers(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizations.listMembers(organizationId, user.id);
  }

  @Post(':organizationId/invitations')
  invite(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InviteMemberDto,
  ) {
    return this.organizations.invite(organizationId, user.id, dto);
  }

  @Post('invitations/accept')
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RespondInvitationDto,
  ) {
    return this.organizations.acceptInvitation(user, dto);
  }

  @Post('invitations/reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RespondInvitationDto,
  ) {
    return this.organizations.rejectInvitation(user, dto);
  }

  @Patch(':organizationId/members/:memberUserId/role')
  updateRole(
    @Param('organizationId') organizationId: string,
    @Param('memberUserId') memberUserId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.organizations.updateMemberRole(
      organizationId,
      user.id,
      memberUserId,
      dto,
    );
  }

  @Delete(':organizationId/members/:memberUserId')
  async removeMember(
    @Param('organizationId') organizationId: string,
    @Param('memberUserId') memberUserId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.organizations.removeMember(
      organizationId,
      user.id,
      memberUserId,
    );
    return { success: true };
  }
}
