import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudentOnboarding1791216000000 implements MigrationInterface {
  name = 'StudentOnboarding1791216000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "students" ALTER COLUMN "fullName" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "students" ALTER COLUMN "email" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "students" ALTER COLUMN "faculty" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "students" ADD "registeredAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "students" ADD "profileCompletedAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "students" ALTER COLUMN "faculty" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "students" ALTER COLUMN "email" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "students" ALTER COLUMN "fullName" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "students" DROP COLUMN "profileCompletedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "students" DROP COLUMN "registeredAt"`,
    );
  }
}
