import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTopupClaims1790956800000 implements MigrationInterface {
  name = 'AddTopupClaims1790956800000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."topup_claims_status_enum" AS ENUM ('pending', 'matched', 'rejected')`);
    await queryRunner.query(`CREATE TABLE "topup_claims" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "studentId" uuid NOT NULL REFERENCES "students"("id"),
      "fullName" varchar(100) NOT NULL, "studentCode" varchar(20) NOT NULL,
      "cardUid" varchar(50) NOT NULL, "amount" integer NOT NULL CHECK ("amount" BETWEEN 1000 AND 5000000),
      "transferredAt" timestamptz NOT NULL, "senderName" varchar(100) NOT NULL,
      "bankName" varchar(100) NOT NULL, "bankReference" varchar(100) NOT NULL,
      "description" varchar(1000) NOT NULL, "evidence" bytea NOT NULL,
      "evidenceMime" varchar(30) NOT NULL, "evidenceSize" integer NOT NULL CHECK ("evidenceSize" BETWEEN 1 AND 5242880),
      "status" "public"."topup_claims_status_enum" NOT NULL DEFAULT 'pending',
      "pendingId" uuid UNIQUE REFERENCES "topup_pendings"("id"),
      "transactionId" uuid REFERENCES "transactions"("id"),
      "reviewedBy" uuid REFERENCES "admins"("id"), "reviewedAt" timestamptz,
      "reviewNote" varchar(1000), "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(), PRIMARY KEY ("id")
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_topup_claims_student_created" ON "topup_claims" ("studentId", "createdAt")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_topup_claims_open_reference" ON "topup_claims" ("studentId", "bankName", "bankReference") WHERE "status" IN ('pending', 'matched')`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "topup_claims"`);
    await queryRunner.query(`DROP TYPE "public"."topup_claims_status_enum"`);
  }
}
