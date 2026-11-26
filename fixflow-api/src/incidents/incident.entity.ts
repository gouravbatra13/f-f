import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { IncidentSeverity } from './incident-severity.enum.js';
import { IncidentStatus } from './incident-status.enum.js';

@Entity('incidents')
@Index('IDX_incidents_org_status_updated', [
  'organizationId',
  'deletedAt',
  'status',
  'updatedAt',
])
@Index('IDX_incidents_org_severity', [
  'organizationId',
  'deletedAt',
  'severity',
])
@Index('IDX_incidents_project', ['projectId', 'deletedAt'])
@Index('IDX_incidents_owner_status', ['ownerUserId', 'status'])
export class Incident {
  @PrimaryColumn('char', { length: 36 })
  id!: string;

  @Column({ name: 'organization_id', type: 'char', length: 36 })
  organizationId!: string;

  @Column({ name: 'project_id', type: 'char', length: 36, nullable: true })
  projectId!: string | null;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'enum', enum: IncidentSeverity, default: IncidentSeverity.SEV3 })
  severity!: IncidentSeverity;

  @Column({ type: 'enum', enum: IncidentStatus, default: IncidentStatus.OPEN })
  status!: IncidentStatus;

  @Column({ name: 'owner_user_id', type: 'char', length: 36, nullable: true })
  ownerUserId!: string | null;

  @Column({ name: 'resolution_notes', type: 'text', nullable: true })
  resolutionNotes!: string | null;

  @Column({ name: 'resolved_at', type: 'datetime', precision: 6, nullable: true })
  resolvedAt!: Date | null;

  @Column({ name: 'deleted_at', type: 'datetime', precision: 6, nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
