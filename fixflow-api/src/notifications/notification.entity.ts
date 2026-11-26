import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('notifications')
@Index('IDX_notifications_user_created', [
  'organizationId',
  'userId',
  'createdAt',
])
@Index('IDX_notifications_user_read', [
  'organizationId',
  'userId',
  'readAt',
])
export class Notification {
  @PrimaryColumn('char', { length: 36 })
  id!: string;

  @Column({ name: 'organization_id', type: 'char', length: 36 })
  organizationId!: string;

  @Column({ name: 'user_id', type: 'char', length: 36 })
  userId!: string;

  @Column({ name: 'project_id', type: 'char', length: 36, nullable: true })
  projectId!: string | null;

  @Column({ name: 'alert_rule_id', type: 'char', length: 36, nullable: true })
  alertRuleId!: string | null;

  @Column({ name: 'error_event_id', type: 'char', length: 36, nullable: true })
  errorEventId!: string | null;

  @Column({ name: 'issue_id', type: 'char', length: 36, nullable: true })
  issueId!: string | null;

  @Column({ type: 'varchar', length: 120 })
  title!: string;

  @Column({ type: 'varchar', length: 1000 })
  message!: string;

  @Column({ name: 'mock_email_status', type: 'enum', enum: ['simulated'] })
  mockEmailStatus!: 'simulated';

  @Column({ name: 'read_at', type: 'datetime', precision: 6, nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;
}
