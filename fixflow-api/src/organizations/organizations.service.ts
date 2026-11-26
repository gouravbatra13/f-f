import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  DataSource,
  IsNull,
  MoreThan,
  QueryFailedError,
  Repository,
} from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { User } from '../users/user.entity.js';
import { CreateOrganizationDto } from './dto/create-organization.dto.js';
import { InviteMemberDto } from './dto/invite-member.dto.js';
import { RespondInvitationDto } from './dto/respond-invitation.dto.js';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto.js';
import { UpdateOrganizationDto } from './dto/update-organization.dto.js';
import {
  InvitationStatus,
  OrganizationInvitation,
} from './organization-invitation.entity.js';
import { OrganizationMember } from './organization-member.entity.js';
import { Organization } from './organization.entity.js';
import { OrganizationRole } from './organization-role.enum.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizations: Repository<Organization>,
    @InjectRepository(OrganizationMember)
    private readonly members: Repository<OrganizationMember>,
    @InjectRepository(OrganizationInvitation)
    private readonly invitations: Repository<OrganizationInvitation>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateOrganizationDto, user: AuthenticatedUser) {
    const organization = new Organization();
    organization.id = randomUUID();
    organization.name = dto.name;
    organization.slug = dto.slug ?? this.slugify(dto.name, organization.id);
    organization.createdByUserId = user.id;
    organization.deletedAt = null;

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.save(Organization, organization);
        const owner = new OrganizationMember();
        owner.id = randomUUID();
        owner.organizationId = organization.id;
        owner.userId = user.id;
        owner.role = OrganizationRole.OWNER;
        await manager.save(OrganizationMember, owner);
      });
    } catch (error) {
      if (this.isDuplicateEntry(error)) {
        throw new ConflictException('An organization with this slug already exists');
      }
      throw error;
    }

    return this.toOrganization(organization, OrganizationRole.OWNER);
  }

  async listForUser(userId: string) {
    const rows = await this.organizations
      .createQueryBuilder('organization')
      .innerJoin(
        OrganizationMember,
        'membership',
        'membership.organizationId = organization.id',
      )
      .where('membership.userId = :userId', { userId })
      .andWhere('organization.deletedAt IS NULL')
      .orderBy('organization.createdAt', 'DESC')
      .getMany();
    const memberships = await this.members.find({ where: { userId } });
    const roles = new Map(
      memberships.map((membership) => [
        membership.organizationId,
        membership.role,
      ]),
    );
    return rows.map((organization) =>
      this.toOrganization(organization, roles.get(organization.id)!),
    );
  }

  async getById(organizationId: string, userId: string) {
    const { organization, membership } = await this.getMemberContext(
      organizationId,
      userId,
    );
    return this.toOrganization(organization, membership.role);
  }

  async update(
    organizationId: string,
    userId: string,
    dto: UpdateOrganizationDto,
  ) {
    const { organization, membership } = await this.getMemberContext(
      organizationId,
      userId,
    );
    this.requireRole(membership, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
    ]);

    if (dto.name !== undefined) organization.name = dto.name;
    if (dto.slug !== undefined) organization.slug = dto.slug;

    try {
      await this.organizations.save(organization);
    } catch (error) {
      if (this.isDuplicateEntry(error)) {
        throw new ConflictException('An organization with this slug already exists');
      }
      throw error;
    }

    return this.toOrganization(organization, membership.role);
  }

  async listMembers(organizationId: string, userId: string) {
    await this.getMemberContext(organizationId, userId);
    const rows = await this.members
      .createQueryBuilder('membership')
      .innerJoin(User, 'user', 'user.id = membership.userId')
      .where('membership.organizationId = :organizationId', {
        organizationId,
      })
      .orderBy('membership.createdAt', 'ASC')
      .select([
        'membership.id AS id',
        'membership.organizationId AS organizationId',
        'membership.userId AS userId',
        'membership.role AS role',
        'membership.createdAt AS joinedAt',
        'user.email AS email',
        'user.name AS name',
      ])
      .getRawMany();
    return rows;
  }

  async invite(
    organizationId: string,
    userId: string,
    dto: InviteMemberDto,
  ) {
    const email = dto.email.toLowerCase();
    const token = randomBytes(32).toString('base64url');
    const invitation = new OrganizationInvitation();
    invitation.id = randomUUID();
    invitation.organizationId = organizationId;
    invitation.invitedByUserId = userId;
    invitation.email = email;
    invitation.role = dto.role;
    invitation.tokenHash = this.hashToken(token);
    invitation.status = InvitationStatus.PENDING;
    invitation.expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    invitation.respondedAt = null;

    await this.dataSource.transaction(async (manager) => {
      const organization = await manager.findOne(Organization, {
        where: { id: organizationId, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!organization) throw new NotFoundException('Organization not found');
      const membership = await manager.findOne(OrganizationMember, {
        where: { organizationId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!membership) throw new NotFoundException('Organization not found');
      this.assertCanInvite(membership.role, dto.role);

      const invitedUser = await manager.findOne(User, { where: { email } });
      if (
        invitedUser &&
        (await manager.findOne(OrganizationMember, {
          where: { organizationId, userId: invitedUser.id },
        }))
      ) {
        throw new ConflictException('This user is already an organization member');
      }

      const existingInvite = await manager.findOne(OrganizationInvitation, {
        where: {
          organizationId,
          email,
          status: InvitationStatus.PENDING,
          expiresAt: MoreThan(new Date()),
        },
      });
      if (existingInvite) {
        throw new ConflictException(
          'A pending invitation already exists for this email',
        );
      }
      await manager.save(OrganizationInvitation, invitation);
    });

    return {
      invitation: this.toInvitation(invitation),
      mockDelivery: {
        to: invitation.email,
        acceptToken: token,
        note: 'Development mock only; share this token with the invited user.',
      },
    };
  }

  async acceptInvitation(user: AuthenticatedUser, dto: RespondInvitationDto) {
    return this.respondToInvitation(user, dto.token, InvitationStatus.ACCEPTED);
  }

  async rejectInvitation(user: AuthenticatedUser, dto: RespondInvitationDto) {
    return this.respondToInvitation(user, dto.token, InvitationStatus.REJECTED);
  }

  async removeMember(
    organizationId: string,
    requesterId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const requester = await manager.findOne(OrganizationMember, {
        where: { organizationId, userId: requesterId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!requester) throw new NotFoundException('Organization not found');
      this.requireRole(requester, [
        OrganizationRole.OWNER,
        OrganizationRole.ADMIN,
      ]);
      const target = await manager.findOne(OrganizationMember, {
        where: { organizationId, userId: targetUserId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!target) throw new NotFoundException('Organization member not found');
      this.assertCanManageTarget(requester.role, target.role);
      const targetUser = await manager.findOne(User, {
        where: { id: targetUserId },
        select: { email: true },
      });
      if (!targetUser) throw new NotFoundException('Organization member not found');
      await manager.delete(OrganizationMember, {
        organizationId,
        userId: targetUserId,
      });
      await manager.update(
        OrganizationInvitation,
        {
          organizationId,
          email: targetUser.email,
          status: InvitationStatus.PENDING,
        },
        { status: InvitationStatus.REVOKED, respondedAt: new Date() },
      );
    });
  }

  async updateMemberRole(
    organizationId: string,
    requesterId: string,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
  ) {
    if (dto.role === OrganizationRole.OWNER) {
      throw new ForbiddenException('Ownership transfer is not available');
    }
    return this.dataSource.transaction(async (manager) => {
      const requester = await manager.findOne(OrganizationMember, {
        where: { organizationId, userId: requesterId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!requester) throw new NotFoundException('Organization not found');
      this.requireRole(requester, [
        OrganizationRole.OWNER,
        OrganizationRole.ADMIN,
      ]);
      const target = await manager.findOne(OrganizationMember, {
        where: { organizationId, userId: targetUserId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!target) throw new NotFoundException('Organization member not found');
      this.assertCanManageTarget(requester.role, target.role);
      if (
        requester.role === OrganizationRole.ADMIN &&
        dto.role === OrganizationRole.ADMIN
      ) {
        throw new ForbiddenException('Only an owner can grant the admin role');
      }

      target.role = dto.role;
      const updated = await manager.save(OrganizationMember, target);
      return {
        id: updated.id,
        organizationId: updated.organizationId,
        userId: updated.userId,
        role: updated.role,
        updatedAt: updated.updatedAt,
      };
    });
  }

  private async respondToInvitation(
    user: AuthenticatedUser,
    rawToken: string,
    status: InvitationStatus.ACCEPTED | InvitationStatus.REJECTED,
  ) {
    const tokenHash = this.hashToken(rawToken);
    return this.dataSource.transaction(async (manager) => {
      const invitation = await manager.findOne(OrganizationInvitation, {
        where: { tokenHash },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invitation || invitation.email !== user.email.toLowerCase()) {
        throw new NotFoundException('Invitation not found');
      }
      if (invitation.status !== InvitationStatus.PENDING) {
        throw new ConflictException('Invitation is no longer pending');
      }
      if (invitation.expiresAt <= new Date()) {
        invitation.status = InvitationStatus.EXPIRED;
        invitation.respondedAt = new Date();
        await manager.save(OrganizationInvitation, invitation);
        return { expired: true, invitation: this.toInvitation(invitation) };
      }
      if (status === InvitationStatus.ACCEPTED) {
        const organization = await manager.findOne(Organization, {
          where: { id: invitation.organizationId, deletedAt: IsNull() },
          lock: { mode: 'pessimistic_write' },
        });
        if (!organization) throw new NotFoundException('Invitation not found');
        const existingMembership = await manager.findOne(OrganizationMember, {
          where: { organizationId: invitation.organizationId, userId: user.id },
        });
        if (existingMembership) {
          throw new ConflictException('This user is already an organization member');
        }
        const membership = new OrganizationMember();
        membership.id = randomUUID();
        membership.organizationId = invitation.organizationId;
        membership.userId = user.id;
        membership.role = invitation.role;
        await manager.save(OrganizationMember, membership);
      }

      invitation.status = status;
      invitation.respondedAt = new Date();
      await manager.save(OrganizationInvitation, invitation);
      return { expired: false, invitation: this.toInvitation(invitation) };
    }).then((result) => {
      if (result.expired) {
        throw new ConflictException('Invitation has expired');
      }
      return result.invitation;
    });
  }

  private async getMemberContext(organizationId: string, userId: string) {
    const [organization, membership] = await Promise.all([
      this.organizations.findOne({
        where: { id: organizationId, deletedAt: IsNull() },
      }),
      this.members.findOne({ where: { organizationId, userId } }),
    ]);
    if (!organization || !membership) {
      throw new NotFoundException('Organization not found');
    }
    return { organization, membership };
  }

  private requireRole(
    member: OrganizationMember,
    roles: OrganizationRole[],
  ): void {
    if (!roles.includes(member.role)) {
      throw new ForbiddenException('You do not have permission for this organization action');
    }
  }

  private assertCanInvite(
    actorRole: OrganizationRole,
    invitedRole: OrganizationRole,
  ): void {
    if (invitedRole === OrganizationRole.OWNER) {
      throw new ForbiddenException('Owner role cannot be assigned by invitation');
    }
    if (actorRole === OrganizationRole.OWNER) {
      return;
    }
    if (
      actorRole === OrganizationRole.ADMIN &&
      invitedRole !== OrganizationRole.ADMIN
    ) {
      return;
    }
    if (
      actorRole === OrganizationRole.MANAGER &&
      [OrganizationRole.DEVELOPER, OrganizationRole.VIEWER].includes(invitedRole)
    ) {
      return;
    }
    throw new ForbiddenException('You cannot invite members with this role');
  }

  private assertCanManageTarget(
    actorRole: OrganizationRole,
    targetRole: OrganizationRole,
  ): void {
    if (targetRole === OrganizationRole.OWNER) {
      throw new ForbiddenException('Organization ownership cannot be changed here');
    }
    if (
      actorRole === OrganizationRole.ADMIN &&
      targetRole === OrganizationRole.ADMIN
    ) {
      throw new ForbiddenException('Only an owner can manage organization admins');
    }
  }

  private toOrganization(
    organization: Organization,
    currentUserRole: OrganizationRole,
  ) {
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      currentUserRole,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
    };
  }

  private toInvitation(invitation: OrganizationInvitation) {
    return {
      id: invitation.id,
      organizationId: invitation.organizationId,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      respondedAt: invitation.respondedAt,
    };
  }

  private slugify(name: string, id: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 130);
    return `${base || 'organization'}-${id.slice(0, 8)}`;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private isDuplicateEntry(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      'code' in error.driverError &&
      error.driverError.code === 'ER_DUP_ENTRY'
    );
  }
}
