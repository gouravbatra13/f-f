import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AlertEnvironment } from './alert-environment.enum.js';
import { AlertRuleType } from './alert-rule-type.enum.js';

@Entity('alert_rules')
@Index('IDX_alert_rules_org_enabled', [
  'organizationId',
  'isEnabled',
  'deletedAt',
])
@Index('IDX_alert_rules_project_enabled', [
  'projectId',
  'isEnabled',
  'deletedAt',
])
export class AlertRule {
  @PrimaryColumn('char', { length: 36 })
  id!: string;

  @Column({ name: 'organization_id', type: 'char', length: 36 })
  organizationId!: string;

  @Column({ name: 'project_id', type: 'char', length: 36, nullable: true })
  projectId!: string | null;

  @Column({ name: 'created_by_user_id', type: 'char', length: 36, nullable: true })
  createdByUserId!: string | null;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'enum', enum: AlertRuleType })
  type!: AlertRuleType;

  @Column({
    type: 'enum',
    enum: AlertEnvironment,
    nullable: true,
  })
  environment!: AlertEnvironment | null;

  @Column({ name: 'threshold_count', type: 'int', unsigned: true, nullable: true })
  thresholdCount!: number | null;

  @Column({ name: 'window_minutes', type: 'smallint', unsigned: true, nullable: true })
  windowMinutes!: number | null;

  @Column({ name: 'cooldown_minutes', type: 'smallint', unsigned: true, default: 15 })
  cooldownMinutes!: number;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled!: boolean;

  @Column({ name: 'last_triggered_at', type: 'datetime', precision: 6, nullable: true })
  lastTriggeredAt!: Date | null;

  @Column({ name: 'deleted_at', type: 'datetime', precision: 6, nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
