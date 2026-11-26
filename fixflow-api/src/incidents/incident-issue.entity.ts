import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('incident_issues')
@Index('IDX_incident_issues_issue', ['issueId'])
export class IncidentIssue {
  @PrimaryColumn({ name: 'incident_id', type: 'char', length: 36 })
  incidentId!: string;

  @PrimaryColumn({ name: 'issue_id', type: 'char', length: 36 })
  issueId!: string;

  @Column({ name: 'linked_by_user_id', type: 'char', length: 36, nullable: true })
  linkedByUserId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;
}
