import { MigrationInterface, QueryRunner } from 'typeorm';

export class TransactionBalanceAudit1791302400000 implements MigrationInterface {
  name = 'TransactionBalanceAudit1791302400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "balanceBefore" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "balanceAfter" integer`,
    );
    await queryRunner.query(`
      ALTER TABLE "transactions"
      ADD CONSTRAINT "CHK_transactions_balance_audit"
      CHECK (
        ("balanceBefore" IS NULL AND "balanceAfter" IS NULL)
        OR
        ("balanceBefore" IS NOT NULL AND "balanceAfter" IS NOT NULL
          AND "balanceBefore" >= 0 AND "balanceAfter" >= 0)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "CHK_transactions_balance_audit"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN "balanceAfter"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN "balanceBefore"`,
    );
  }
}
