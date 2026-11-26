import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiInvestigations1763000000000
  implements MigrationInterface
{
  name = 'CreateAiInvestigations1763000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE ai_investigations (
        id CHAR(36) NOT NULL,
        organization_id CHAR(36) NOT NULL,
        project_id CHAR(36) NULL,
        actor_user_id CHAR(36) NULL,
        source_type ENUM('ISSUE', 'INCIDENT') NOT NULL,
        source_id CHAR(36) NOT NULL,
        model_name VARCHAR(100) NOT NULL,
        status ENUM('SUCCEEDED') NOT NULL,
        result JSON NOT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY IDX_ai_investigations_source_created
          (organization_id, source_type, source_id, created_at),
        KEY IDX_ai_investigations_actor_created (actor_user_id, created_at),
        CONSTRAINT FK_ai_investigations_organization
          FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
        CONSTRAINT FK_ai_investigations_project
          FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL,
        CONSTRAINT FK_ai_investigations_actor
          FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE ai_investigations');
  }
}
