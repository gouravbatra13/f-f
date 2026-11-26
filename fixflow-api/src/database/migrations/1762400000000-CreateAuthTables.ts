import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthTables1762400000000 implements MigrationInterface {
  name = 'CreateAuthTables1762400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id CHAR(36) NOT NULL,
        email VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('super_admin', 'admin', 'manager', 'developer') NOT NULL DEFAULT 'developer',
        auth_version INT UNSIGNED NOT NULL DEFAULT 0,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_users_email (email)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE refresh_sessions (
        id CHAR(36) NOT NULL,
        token_hash CHAR(64) NOT NULL,
        user_id CHAR(36) NOT NULL,
        family_id CHAR(36) NOT NULL,
        expires_at DATETIME(6) NOT NULL,
        revoked_at DATETIME(6) NULL,
        replaced_by_session_id CHAR(36) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_refresh_sessions_token_hash (token_hash),
        KEY IDX_refresh_sessions_user_id (user_id),
        KEY IDX_refresh_sessions_family_id (family_id),
        KEY IDX_refresh_sessions_expires_at (expires_at),
        KEY IDX_refresh_sessions_replaced_by (replaced_by_session_id),
        CONSTRAINT FK_refresh_sessions_user
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT FK_refresh_sessions_replacement
          FOREIGN KEY (replaced_by_session_id) REFERENCES refresh_sessions (id) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE refresh_sessions');
    await queryRunner.query('DROP TABLE users');
  }
}
