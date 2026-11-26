import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('incident_timeline')
@Index('IDX_incident_timeline_incident_created', ['incidentId', 'createdAt'])
export class IncidentTimeline {
  @PrimaryColumn('char', { length: 36 })
  id!: string;

  @Column({ name: 'incident_id', type: 'char', length: 36 })
  incidentId!: string;

  @Column({ name: 'actor_user_id', type: 'char', length: 36, nullable: true })
  actorUserId!: string | null;

  @Column({ type: 'varchar', length: 64 })
  action!: string;

  @Column({ type: 'json', nullable: true })
  details!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;
}
