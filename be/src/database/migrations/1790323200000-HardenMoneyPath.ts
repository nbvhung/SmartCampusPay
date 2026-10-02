import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenMoneyPath1790323200000 implements MigrationInterface {
  name = 'HardenMoneyPath1790323200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'UQ_accounts_studentId'
            AND conrelid = 'accounts'::regclass
        ) THEN
          ALTER TABLE "accounts"
            ADD CONSTRAINT "UQ_accounts_studentId" UNIQUE ("studentId");
        END IF;
      END $$
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transactions_student_created" ON "transactions" ("studentId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transactions_merchant_created" ON "transactions" ("merchantId", "createdAt")`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'public'
            AND t.typname = 'topup_pendings_status_enum'
        ) THEN
          CREATE TYPE "public"."topup_pendings_status_enum"
            AS ENUM('pending', 'matched', 'ignored');
        END IF;
      END $$
    `);
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "topup_pendings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "transferId" character varying(64) NOT NULL, "amount" integer NOT NULL, "content" character varying(255) NOT NULL, "sender" character varying(100), "bankRef" character varying(64), "bankName" character varying(100), "status" "public"."topup_pendings_status_enum" NOT NULL DEFAULT 'pending', "studentId" character varying, "adminId" character varying, "transactionId" character varying, "matchedAt" TIMESTAMP WITH TIME ZONE, "note" character varying(255), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_topup_pendings_transferId" UNIQUE ("transferId"), CONSTRAINT "PK_topup_pendings" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'UQ_topup_pendings_transferId'
            AND conrelid = 'topup_pendings'::regclass
        ) THEN
          ALTER TABLE "topup_pendings"
            ADD CONSTRAINT "UQ_topup_pendings_transferId" UNIQUE ("transferId");
        END IF;
      END $$
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_topup_pendings_status_created" ON "topup_pendings" ("status", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_topup_pendings_status_created"`);
    await queryRunner.query(`DROP TABLE "topup_pendings"`);
    await queryRunner.query(`DROP TYPE "public"."topup_pendings_status_enum"`);
    await queryRunner.query(`DROP INDEX "IDX_transactions_merchant_created"`);
    await queryRunner.query(`DROP INDEX "IDX_transactions_student_created"`);
    await queryRunner.query(
      `ALTER TABLE "accounts" DROP CONSTRAINT "UQ_accounts_studentId"`,
    );
  }
}
