import { MigrationInterface, QueryRunner } from 'typeorm';

export class PrepareHardwareIntegration1790899200000 implements MigrationInterface {
  name = 'PrepareHardwareIntegration1790899200000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "dailySpentDate" date`,
    );
    await queryRunner.query(
      `UPDATE "accounts" SET "dailySpentDate" = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date WHERE "dailySpentDate" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "cardUid" varchar(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "expiresAt" timestamptz`,
    );
    await queryRunner.query(
      `UPDATE "transactions" SET "expiresAt" = "createdAt" + interval '30 minutes' WHERE "type" = 'credit' AND "referenceCode" IS NOT NULL AND "expiresAt" IS NULL`,
    );
    // Unique constraint aborts on UID collisions, preserving every card.
    await queryRunner.query(
      `UPDATE "cards" SET "uid" = CASE WHEN upper(trim("uid")) LIKE 'MOCK-%' THEN upper(trim("uid")) ELSE regexp_replace(upper(trim("uid")), '[[:space:]:-]', '', 'g') END`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD CONSTRAINT "CHK_accounts_money" CHECK ("balance" >= 0 AND "dailySpent" >= 0 AND "dailyLimit" >= 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "CHK_transactions_amount" CHECK ("amount" >= 0)`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "CHK_transactions_amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounts" DROP CONSTRAINT "CHK_accounts_money"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN "expiresAt", DROP COLUMN "cardUid"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounts" DROP COLUMN "dailySpentDate"`,
    );
  }
}
