import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrganizationRole } from './organization-role.enum.js';

@Entity('organization_members')
@Index('UQ_organization_members_org_user', ['organizationId', 'userId'], {
  unique: true,
})
@Index('IDX_organization_members_user', ['userId'])
export class OrganizationMember {
  @PrimaryColumn('char', { length: 36 })
  id!: string;

  @Column({ name: 'organization_id', type: 'char', length: 36 })
  organizationId!: string;

  @Column({ name: 'user_id', type: 'char', length: 36 })
  userId!: string;

  @Column({
    type: 'enum',
    enum: OrganizationRole,
    default: OrganizationRole.DEVELOPER,
  })
  role!: OrganizationRole;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
