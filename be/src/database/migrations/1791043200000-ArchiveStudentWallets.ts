import { MigrationInterface, QueryRunner } from 'typeorm';

export class ArchiveStudentWallets1791043200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['students', 'accounts', 'cards']) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD "deletedAt" timestamptz`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Dropping these columns would make archived records visible again.
    for (const table of ['students', 'accounts', 'cards']) {
      const archived = await queryRunner.query(
        `SELECT 1 FROM "${table}" WHERE "deletedAt" IS NOT NULL LIMIT 1`,
      );
      if (archived.length) {
        throw new Error(
          'Cannot revert archival migration while archived records exist',
        );
      }
    }
    for (const table of ['cards', 'accounts', 'students']) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "deletedAt"`);
    }
  }
}
