import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { OrganizationRole } from './organization-role.enum.js';

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  REVOKED = 'revoked',
  EXPIRED = 'expired',
}

@Entity('organization_invitations')
@Index('UQ_organization_invitations_token_hash', ['tokenHash'], {
  unique: true,
})
@Index('IDX_organization_invitations_org_status', [
  'organizationId',
  'status',
])
@Index('IDX_organization_invitations_email', ['email'])
export class OrganizationInvitation {
  @PrimaryColumn('char', { length: 36 })
  id!: string;

  @Column({ name: 'organization_id', type: 'char', length: 36 })
  organizationId!: string;

  @Column({ name: 'invited_by_user_id', type: 'char', length: 36 })
  invitedByUserId!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'enum', enum: OrganizationRole })
  role!: OrganizationRole;

  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @Column({
    type: 'enum',
    enum: InvitationStatus,
    default: InvitationStatus.PENDING,
  })
  status!: InvitationStatus;

  @Column({ name: 'expires_at', type: 'datetime', precision: 6 })
  expiresAt!: Date;

  @Column({
    name: 'responded_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  respondedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;
}
