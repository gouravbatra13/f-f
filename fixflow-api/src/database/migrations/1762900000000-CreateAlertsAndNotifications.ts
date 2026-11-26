import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAlertsAndNotifications1762900000000
  implements MigrationInterface
{
  name = 'CreateAlertsAndNotifications1762900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE alert_rules (
        id CHAR(36) NOT NULL,
        organization_id CHAR(36) NOT NULL,
        project_id CHAR(36) NULL,
        created_by_user_id CHAR(36) NULL,
        name VARCHAR(120) NOT NULL,
        type ENUM('CRITICAL_ERROR', 'ERROR_SPIKE') NOT NULL,
        environment ENUM('production', 'staging', 'development') NULL,
        threshold_count INT UNSIGNED NULL,
        window_minutes SMALLINT UNSIGNED NULL,
        cooldown_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 15,
        is_enabled TINYINT(1) NOT NULL DEFAULT 1,
        last_triggered_at DATETIME(6) NULL,
        deleted_at DATETIME(6) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY IDX_alert_rules_org_enabled (organization_id, is_enabled, deleted_at),
        KEY IDX_alert_rules_project_enabled (project_id, is_enabled, deleted_at),
        CONSTRAINT FK_alert_rules_organization
          FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
        CONSTRAINT FK_alert_rules_project
          FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL,
        CONSTRAINT FK_alert_rules_creator
          FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE notifications (
        id CHAR(36) NOT NULL,
        organization_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        project_id CHAR(36) NULL,
        alert_rule_id CHAR(36) NULL,
        error_event_id CHAR(36) NULL,
        issue_id CHAR(36) NULL,
        title VARCHAR(120) NOT NULL,
        message VARCHAR(1000) NOT NULL,
        mock_email_status ENUM('simulated') NOT NULL DEFAULT 'simulated',
        read_at DATETIME(6) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY IDX_notifications_user_created (organization_id, user_id, created_at),
        KEY IDX_notifications_user_read (organization_id, user_id, read_at),
        CONSTRAINT FK_notifications_organization
          FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
        CONSTRAINT FK_notifications_user
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT FK_notifications_project
          FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL,
        CONSTRAINT FK_notifications_rule
          FOREIGN KEY (alert_rule_id) REFERENCES alert_rules (id) ON DELETE SET NULL,
        CONSTRAINT FK_notifications_event
          FOREIGN KEY (error_event_id) REFERENCES error_events (id) ON DELETE SET NULL,
        CONSTRAINT FK_notifications_issue
          FOREIGN KEY (issue_id) REFERENCES issues (id) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(
      'ALTER TABLE error_events ADD INDEX IDX_error_events_project_created_environment (project_id, created_at, environment)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE error_events DROP INDEX IDX_error_events_project_created_environment',
    );
    await queryRunner.query('DROP TABLE notifications');
    await queryRunner.query('DROP TABLE alert_rules');
  }
}
