import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('issue_comments')
@Index('IDX_issue_comments_issue_created', ['issueId', 'createdAt'])
export class IssueComment {
  @PrimaryColumn('char', { length: 36 })
  id!: string;

  @Column({ name: 'issue_id', type: 'char', length: 36 })
  issueId!: string;

  @Column({ name: 'author_user_id', type: 'char', length: 36, nullable: true })
  authorUserId!: string | null;

  @Column({ type: 'varchar', length: 4000 })
  body!: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;
}
