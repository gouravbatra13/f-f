import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../users/user.entity.js';

@Entity('refresh_sessions')
@Index('IDX_refresh_sessions_user_id', ['userId'])
@Index('IDX_refresh_sessions_family_id', ['familyId'])
@Index('IDX_refresh_sessions_expires_at', ['expiresAt'])
@Index('IDX_refresh_sessions_replaced_by', ['replacedBySessionId'])
export class RefreshSession {
  @PrimaryColumn('char', { length: 36 })
  id!: string;

  @Index('UQ_refresh_sessions_token_hash', { unique: true })
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @Column({ name: 'user_id', type: 'char', length: 36 })
  userId!: string;

  @Column({ name: 'family_id', type: 'char', length: 36 })
  familyId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'expires_at', type: 'datetime', precision: 6 })
  expiresAt!: Date;

  @Column({
    name: 'revoked_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  revokedAt!: Date | null;

  @Column({
    name: 'replaced_by_session_id',
    type: 'char',
    length: 36,
    nullable: true,
  })
  replacedBySessionId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;
}
