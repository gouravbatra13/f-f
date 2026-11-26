import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrganizationsAndProjects1762500000000
  implements MigrationInterface
{
  name = 'CreateOrganizationsAndProjects1762500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const userRoleColumns = (await queryRunner.query(`
      SELECT COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'
    `)) as Array<{ COLUMN_TYPE: string }>;
    const roleColumn = userRoleColumns[0]?.COLUMN_TYPE ?? '';
    if (roleColumn.includes("'member'")) {
      await queryRunner.query(`
        ALTER TABLE users MODIFY role
        ENUM('member', 'admin', 'manager', 'developer', 'super_admin')
        NOT NULL DEFAULT 'developer'
      `);
      await queryRunner.query(
        `UPDATE users SET role = 'developer' WHERE role = 'member'`,
      );
      await queryRunner.query(`
        ALTER TABLE users MODIFY role
        ENUM('super_admin', 'admin', 'manager', 'developer')
        NOT NULL DEFAULT 'developer'
      `);
    }

    const familyColumns = (await queryRunner.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'refresh_sessions'
        AND COLUMN_NAME = 'family_id'
    `)) as Array<{ COLUMN_NAME: string }>;
    if (familyColumns.length === 0) {
      await queryRunner.query(
        'ALTER TABLE refresh_sessions ADD family_id CHAR(36) NULL',
      );
      await queryRunner.query(
        'UPDATE refresh_sessions SET family_id = UUID() WHERE family_id IS NULL',
      );
      await queryRunner.query(
        'ALTER TABLE refresh_sessions MODIFY family_id CHAR(36) NOT NULL',
      );
    }

    const familyIndexes = (await queryRunner.query(`
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'refresh_sessions'
        AND INDEX_NAME = 'IDX_refresh_sessions_family_id'
    `)) as Array<{ INDEX_NAME: string }>;
    if (familyIndexes.length === 0) {
      await queryRunner.query(
        'CREATE INDEX IDX_refresh_sessions_family_id ON refresh_sessions (family_id)',
      );
    }

    await queryRunner.query(`
      CREATE TABLE organizations (
        id CHAR(36) NOT NULL,
        name VARCHAR(120) NOT NULL,
        slug VARCHAR(150) NOT NULL,
        created_by_user_id CHAR(36) NOT NULL,
        deleted_at DATETIME(6) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_organizations_slug (slug),
        CONSTRAINT FK_organizations_created_by
          FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE RESTRICT
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE organization_members (
        id CHAR(36) NOT NULL,
        organization_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        role ENUM('owner', 'admin', 'manager', 'developer', 'viewer') NOT NULL DEFAULT 'developer',
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_organization_members_org_user (organization_id, user_id),
        KEY IDX_organization_members_user (user_id),
        CONSTRAINT FK_organization_members_organization
          FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
        CONSTRAINT FK_organization_members_user
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE organization_invitations (
        id CHAR(36) NOT NULL,
        organization_id CHAR(36) NOT NULL,
        invited_by_user_id CHAR(36) NOT NULL,
        email VARCHAR(255) NOT NULL,
        role ENUM('owner', 'admin', 'manager', 'developer', 'viewer') NOT NULL,
        token_hash CHAR(64) NOT NULL,
        status ENUM('pending', 'accepted', 'rejected', 'revoked', 'expired') NOT NULL DEFAULT 'pending',
        expires_at DATETIME(6) NOT NULL,
        responded_at DATETIME(6) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_organization_invitations_token_hash (token_hash),
        KEY IDX_organization_invitations_org_status (organization_id, status),
        KEY IDX_organization_invitations_email (email),
        CONSTRAINT FK_organization_invitations_organization
          FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
        CONSTRAINT FK_organization_invitations_invited_by
          FOREIGN KEY (invited_by_user_id) REFERENCES users (id) ON DELETE RESTRICT
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE projects (
        id CHAR(36) NOT NULL,
        organization_id CHAR(36) NOT NULL,
        name VARCHAR(120) NOT NULL,
        identifier VARCHAR(32) NOT NULL,
        description VARCHAR(1000) NULL,
        archived_at DATETIME(6) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_projects_identifier (identifier),
        UNIQUE KEY UQ_projects_org_name (organization_id, name),
        KEY IDX_projects_organization (organization_id, archived_at),
        CONSTRAINT FK_projects_organization
          FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE project_api_keys (
        id CHAR(36) NOT NULL,
        project_id CHAR(36) NOT NULL,
        created_by_user_id CHAR(36) NOT NULL,
        name VARCHAR(100) NOT NULL,
        key_prefix VARCHAR(16) NOT NULL,
        key_hash CHAR(64) NOT NULL,
        last_used_at DATETIME(6) NULL,
        revoked_at DATETIME(6) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_project_api_keys_hash (key_hash),
        KEY IDX_project_api_keys_project (project_id, revoked_at),
        CONSTRAINT FK_project_api_keys_project
          FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
        CONSTRAINT FK_project_api_keys_created_by
          FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE RESTRICT
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE project_api_keys');
    await queryRunner.query('DROP TABLE projects');
    await queryRunner.query('DROP TABLE organization_invitations');
    await queryRunner.query('DROP TABLE organization_members');
    await queryRunner.query('DROP TABLE organizations');
  }
}
