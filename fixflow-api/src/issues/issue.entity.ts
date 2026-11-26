import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { IssueSeverity } from './issue-severity.enum.js';
import { IssueStatus } from './issue-status.enum.js';

@Entity('issues')
@Index('UQ_issues_project_fingerprint', ['projectId', 'fingerprint'], {
  unique: true,
})
@Index('IDX_issues_project_status_last_seen', [
  'projectId',
  'status',
  'lastSeenAt',
])
@Index('IDX_issues_project_severity_last_seen', [
  'projectId',
  'severity',
  'lastSeenAt',
])
@Index('IDX_issues_assignee', ['assigneeUserId', 'status'])
@Index('IDX_issues_title_fulltext', ['title'], { fulltext: true })
export class Issue {
  @PrimaryColumn('char', { length: 36 })
  id!: string;

  @Column({ name: 'project_id', type: 'char', length: 36 })
  projectId!: string;

  @Column({ type: 'char', length: 64 })
  fingerprint!: string;

  @Column({ type: 'varchar', length: 512 })
  title!: string;

  @Column({ type: 'enum', enum: IssueStatus, default: IssueStatus.OPEN })
  status!: IssueStatus;

  @Column({ type: 'enum', enum: IssueSeverity })
  severity!: IssueSeverity;

  @Column({ name: 'event_count', type: 'int', unsigned: true, default: 1 })
  eventCount!: number;

  @Column({ name: 'first_seen_at', type: 'datetime', precision: 6 })
  firstSeenAt!: Date;

  @Column({ name: 'last_seen_at', type: 'datetime', precision: 6 })
  lastSeenAt!: Date;

  @Column({ type: 'json' })
  environments!: string[];

  @Column({ type: 'json' })
  endpoints!: string[];

  @Column({ type: 'json' })
  releases!: string[];

  @Column({ name: 'assignee_user_id', type: 'char', length: 36, nullable: true })
  assigneeUserId!: string | null;

  @Column({ name: 'resolved_at', type: 'datetime', precision: 6, nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
