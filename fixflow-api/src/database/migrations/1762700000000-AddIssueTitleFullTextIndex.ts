import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIssueTitleFullTextIndex1762700000000
  implements MigrationInterface
{
  name = 'AddIssueTitleFullTextIndex1762700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE issues ADD FULLTEXT INDEX IDX_issues_title_fulltext (title)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE issues DROP INDEX IDX_issues_title_fulltext',
    );
  }
}
