import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { IssueSeverity } from './issue-severity.enum.js';

@Entity('error_events')
@Index('IDX_error_events_issue_occurred', ['issueId', 'occurredAt'])
@Index('IDX_error_events_project_occurred', ['projectId', 'occurredAt'])
export class ErrorEvent {
  @PrimaryColumn('char', { length: 36 })
  id!: string;

  @Column({ name: 'project_id', type: 'char', length: 36 })
  projectId!: string;

  @Column({ name: 'issue_id', type: 'char', length: 36 })
  issueId!: string;

  @Column({ name: 'api_key_id', type: 'char', length: 36, nullable: true })
  apiKeyId!: string | null;

  @Column({ name: 'error_message', type: 'varchar', length: 2000 })
  errorMessage!: string;

  @Column({ name: 'stack_trace', type: 'text', nullable: true })
  stackTrace!: string | null;

  @Column({ type: 'enum', enum: IssueSeverity })
  severity!: IssueSeverity;

  @Column({ type: 'varchar', length: 100, nullable: true })
  environment!: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  release!: string | null;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  endpoint!: string | null;

  @Column({ name: 'occurred_at', type: 'datetime', precision: 6 })
  occurredAt!: Date;

  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;
}
