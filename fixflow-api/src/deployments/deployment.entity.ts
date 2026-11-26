import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DeploymentEnvironment } from './deployment-environment.enum.js';
import { DeploymentStatus } from './deployment-status.enum.js';

@Entity('deployments')
@Index('IDX_deployments_project_environment_at', [
  'projectId',
  'environment',
  'deployedAt',
])
@Index('IDX_deployments_project_status_at', [
  'projectId',
  'status',
  'deployedAt',
])
export class Deployment {
  @PrimaryColumn('char', { length: 36 })
  id!: string;

  @Column({ name: 'project_id', type: 'char', length: 36 })
  projectId!: string;

  @Column({ type: 'enum', enum: DeploymentEnvironment })
  environment!: DeploymentEnvironment;

  @Column({ type: 'varchar', length: 150 })
  release!: string;

  @Column({ type: 'enum', enum: DeploymentStatus, default: DeploymentStatus.PENDING })
  status!: DeploymentStatus;

  @Column({ name: 'deployed_at', type: 'datetime', precision: 6 })
  deployedAt!: Date;

  @Column({ name: 'commit_hash', type: 'varchar', length: 64, nullable: true })
  commitHash!: string | null;

  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ name: 'deleted_at', type: 'datetime', precision: 6, nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
