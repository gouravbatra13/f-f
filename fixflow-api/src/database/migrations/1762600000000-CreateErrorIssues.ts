import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateErrorIssues1762600000000 implements MigrationInterface {
  name = 'CreateErrorIssues1762600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE issues (
        id CHAR(36) NOT NULL,
        project_id CHAR(36) NOT NULL,
        fingerprint CHAR(64) NOT NULL,
        title VARCHAR(512) NOT NULL,
        status ENUM('open', 'resolved', 'ignored') NOT NULL DEFAULT 'open',
        severity ENUM('critical', 'error', 'warning', 'info') NOT NULL,
        event_count INT UNSIGNED NOT NULL DEFAULT 1,
        first_seen_at DATETIME(6) NOT NULL,
        last_seen_at DATETIME(6) NOT NULL,
        environments JSON NOT NULL,
        endpoints JSON NOT NULL,
        releases JSON NOT NULL,
        assignee_user_id CHAR(36) NULL,
        resolved_at DATETIME(6) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_issues_project_fingerprint (project_id, fingerprint),
        KEY IDX_issues_project_status_last_seen (project_id, status, last_seen_at),
        KEY IDX_issues_project_severity_last_seen (project_id, severity, last_seen_at),
        KEY IDX_issues_assignee (assignee_user_id, status),
        CONSTRAINT FK_issues_project
          FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
        CONSTRAINT FK_issues_assignee
          FOREIGN KEY (assignee_user_id) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE error_events (
        id CHAR(36) NOT NULL,
        project_id CHAR(36) NOT NULL,
        issue_id CHAR(36) NOT NULL,
        api_key_id CHAR(36) NULL,
        error_message VARCHAR(2000) NOT NULL,
        stack_trace TEXT NULL,
        severity ENUM('critical', 'error', 'warning', 'info') NOT NULL,
        environment VARCHAR(100) NULL,
        \`release\` VARCHAR(150) NULL,
        endpoint VARCHAR(2048) NULL,
        occurred_at DATETIME(6) NOT NULL,
        metadata JSON NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY IDX_error_events_issue_occurred (issue_id, occurred_at),
        KEY IDX_error_events_project_occurred (project_id, occurred_at),
        CONSTRAINT FK_error_events_project
          FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
        CONSTRAINT FK_error_events_issue
          FOREIGN KEY (issue_id) REFERENCES issues (id) ON DELETE CASCADE,
        CONSTRAINT FK_error_events_api_key
          FOREIGN KEY (api_key_id) REFERENCES project_api_keys (id) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE issue_comments (
        id CHAR(36) NOT NULL,
        issue_id CHAR(36) NOT NULL,
        author_user_id CHAR(36) NULL,
        body VARCHAR(4000) NOT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY IDX_issue_comments_issue_created (issue_id, created_at),
        CONSTRAINT FK_issue_comments_issue
          FOREIGN KEY (issue_id) REFERENCES issues (id) ON DELETE CASCADE,
        CONSTRAINT FK_issue_comments_author
          FOREIGN KEY (author_user_id) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE issue_activity_logs (
        id CHAR(36) NOT NULL,
        issue_id CHAR(36) NOT NULL,
        actor_user_id CHAR(36) NULL,
        action VARCHAR(50) NOT NULL,
        details JSON NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY IDX_issue_activity_issue_created (issue_id, created_at),
        CONSTRAINT FK_issue_activity_issue
          FOREIGN KEY (issue_id) REFERENCES issues (id) ON DELETE CASCADE,
        CONSTRAINT FK_issue_activity_actor
          FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE issue_activity_logs');
    await queryRunner.query('DROP TABLE issue_comments');
    await queryRunner.query('DROP TABLE error_events');
    await queryRunner.query('DROP TABLE issues');
  }
}
