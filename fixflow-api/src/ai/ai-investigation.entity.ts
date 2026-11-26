import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export enum AiInvestigationSourceType {
  ISSUE = 'ISSUE',
  INCIDENT = 'INCIDENT',
}

export enum AiInvestigationStatus {
  SUCCEEDED = 'SUCCEEDED',
}

@Entity('ai_investigations')
@Index('IDX_ai_investigations_source_created', [
  'organizationId',
  'sourceType',
  'sourceId',
  'createdAt',
])
@Index('IDX_ai_investigations_actor_created', ['actorUserId', 'createdAt'])
export class AiInvestigation {
  @PrimaryColumn('char', { length: 36 })
  id!: string;

  @Column({ name: 'organization_id', type: 'char', length: 36 })
  organizationId!: string;

  @Column({ name: 'project_id', type: 'char', length: 36, nullable: true })
  projectId!: string | null;

  @Column({ name: 'actor_user_id', type: 'char', length: 36, nullable: true })
  actorUserId!: string | null;

  @Column({ name: 'source_type', type: 'enum', enum: AiInvestigationSourceType })
  sourceType!: AiInvestigationSourceType;

  @Column({ name: 'source_id', type: 'char', length: 36 })
  sourceId!: string;

  @Column({ name: 'model_name', type: 'varchar', length: 100 })
  modelName!: string;

  @Column({ type: 'enum', enum: AiInvestigationStatus })
  status!: AiInvestigationStatus;

  @Column({ type: 'json' })
  result!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;
}
