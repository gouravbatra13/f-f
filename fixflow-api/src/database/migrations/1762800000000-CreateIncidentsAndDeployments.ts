import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIncidentsAndDeployments1762800000000
  implements MigrationInterface
{
  name = 'CreateIncidentsAndDeployments1762800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE incidents (
        id CHAR(36) NOT NULL,
        organization_id CHAR(36) NOT NULL,
        project_id CHAR(36) NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NULL,
        severity ENUM('SEV1', 'SEV2', 'SEV3', 'SEV4') NOT NULL DEFAULT 'SEV3',
        status ENUM('OPEN', 'INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
        owner_user_id CHAR(36) NULL,
        resolution_notes TEXT NULL,
        resolved_at DATETIME(6) NULL,
        deleted_at DATETIME(6) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY IDX_incidents_org_status_updated (organization_id, deleted_at, status, updated_at),
        KEY IDX_incidents_org_severity (organization_id, deleted_at, severity),
        KEY IDX_incidents_project (project_id, deleted_at),
        KEY IDX_incidents_owner_status (owner_user_id, status),
        CONSTRAINT FK_incidents_organization
          FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
        CONSTRAINT FK_incidents_project
          FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL,
        CONSTRAINT FK_incidents_owner
          FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE incident_issues (
        incident_id CHAR(36) NOT NULL,
        issue_id CHAR(36) NOT NULL,
        linked_by_user_id CHAR(36) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (incident_id, issue_id),
        KEY IDX_incident_issues_issue (issue_id),
        CONSTRAINT FK_incident_issues_incident
          FOREIGN KEY (incident_id) REFERENCES incidents (id) ON DELETE CASCADE,
        CONSTRAINT FK_incident_issues_issue
          FOREIGN KEY (issue_id) REFERENCES issues (id) ON DELETE CASCADE,
        CONSTRAINT FK_incident_issues_linked_by
          FOREIGN KEY (linked_by_user_id) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE incident_timeline (
        id CHAR(36) NOT NULL,
        incident_id CHAR(36) NOT NULL,
        actor_user_id CHAR(36) NULL,
        action VARCHAR(64) NOT NULL,
        details JSON NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY IDX_incident_timeline_incident_created (incident_id, created_at),
        CONSTRAINT FK_incident_timeline_incident
          FOREIGN KEY (incident_id) REFERENCES incidents (id) ON DELETE CASCADE,
        CONSTRAINT FK_incident_timeline_actor
          FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE deployments (
        id CHAR(36) NOT NULL,
        project_id CHAR(36) NOT NULL,
        environment ENUM('PRODUCTION', 'STAGING', 'DEVELOPMENT') NOT NULL,
        \`release\` VARCHAR(150) NOT NULL,
        status ENUM('PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAILED', 'ROLLED_BACK') NOT NULL DEFAULT 'PENDING',
        deployed_at DATETIME(6) NOT NULL,
        commit_hash VARCHAR(64) NULL,
        metadata JSON NULL,
        deleted_at DATETIME(6) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY IDX_deployments_project_environment_at (project_id, environment, deployed_at),
        KEY IDX_deployments_project_status_at (project_id, status, deployed_at),
        CONSTRAINT FK_deployments_project
          FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE deployments');
    await queryRunner.query('DROP TABLE incident_timeline');
    await queryRunner.query('DROP TABLE incident_issues');
    await queryRunner.query('DROP TABLE incidents');
  }
}
