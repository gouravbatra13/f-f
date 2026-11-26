import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('project_api_keys')
@Index('UQ_project_api_keys_hash', ['keyHash'], { unique: true })
@Index('IDX_project_api_keys_project', ['projectId', 'revokedAt'])
export class ProjectApiKey {
  @PrimaryColumn('char', { length: 36 })
  id!: string;

  @Column({ name: 'project_id', type: 'char', length: 36 })
  projectId!: string;

  @Column({ name: 'created_by_user_id', type: 'char', length: 36 })
  createdByUserId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ name: 'key_prefix', type: 'varchar', length: 16 })
  keyPrefix!: string;

  @Column({ name: 'key_hash', type: 'char', length: 64 })
  keyHash!: string;

  @Column({
    name: 'last_used_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  lastUsedAt!: Date | null;

  @Column({
    name: 'revoked_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;
}
