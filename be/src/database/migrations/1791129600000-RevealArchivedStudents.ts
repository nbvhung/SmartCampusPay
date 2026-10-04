import { MigrationInterface, QueryRunner } from 'typeorm';

export class RevealArchivedStudents1791129600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE cards SET "deletedAt" = NULL
      WHERE "studentId" IN (SELECT id FROM students WHERE "deletedAt" IS NOT NULL)
    `);
    await queryRunner.query(`
      UPDATE accounts SET "deletedAt" = NULL
      WHERE "studentId" IN (SELECT id FROM students WHERE "deletedAt" IS NOT NULL)
    `);
    await queryRunner.query(`
      UPDATE students SET "deletedAt" = NULL, "isActive" = false
      WHERE "deletedAt" IS NOT NULL
    `);
    await queryRunner.query(
      `UPDATE accounts SET "deletedAt" = NULL WHERE "deletedAt" IS NOT NULL`,
    );
  }

  async down(): Promise<void> {
    // The original archived set cannot be inferred safely after it is revealed.
  }
}
