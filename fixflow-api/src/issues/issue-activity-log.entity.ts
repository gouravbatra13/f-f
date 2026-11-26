import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('issue_activity_logs')
@Index('IDX_issue_activity_issue_created', ['issueId', 'createdAt'])
export class IssueActivityLog {
  @PrimaryColumn('char', { length: 36 })
  id!: string;

  @Column({ name: 'issue_id', type: 'char', length: 36 })
  issueId!: string;

  @Column({ name: 'actor_user_id', type: 'char', length: 36, nullable: true })
  actorUserId!: string | null;

  @Column({ type: 'varchar', length: 50 })
  action!: string;

  @Column({ type: 'json', nullable: true })
  details!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;
}
