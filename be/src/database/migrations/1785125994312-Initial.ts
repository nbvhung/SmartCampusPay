import { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1785125994312 implements MigrationInterface {
  name = 'Initial1785125994312';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."cards_status_enum" AS ENUM('active', 'inactive', 'lost', 'frozen')`,
    );
    await queryRunner.query(
      `CREATE TABLE "cards" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "uid" character varying(50) NOT NULL, "chipType" character varying(20) NOT NULL DEFAULT 'MIFARE', "chipData" text, "status" "public"."cards_status_enum" NOT NULL DEFAULT 'active', "lastUsedAt" TIMESTAMP WITH TIME ZONE, "studentId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_710a28e78c2bc8acd03cdb1a5f7" UNIQUE ("uid"), CONSTRAINT "PK_5f3269634705fdff4a9935860fc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."merchants_type_enum" AS ENUM('canteen', 'library', 'parking', 'printing', 'other')`,
    );
    await queryRunner.query(
      `CREATE TABLE "merchants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "type" "public"."merchants_type_enum" NOT NULL DEFAULT 'other', "location" character varying(200), "apiKey" character varying(255) NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4fd312ef25f8e05ad47bfe7ed25" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."transactions_type_enum" AS ENUM('debit', 'credit')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."transactions_status_enum" AS ENUM('pending', 'success', 'failed', 'refunded')`,
    );
    await queryRunner.query(
      `CREATE TABLE "transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "amount" integer NOT NULL, "type" "public"."transactions_type_enum" NOT NULL, "status" "public"."transactions_status_enum" NOT NULL DEFAULT 'pending', "idempotencyKey" character varying(64) NOT NULL, "referenceCode" character varying(32), "description" character varying(255), "studentCode" character varying(20), "studentId" uuid NOT NULL, "accountId" uuid, "merchantId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_86238dd0ae2d79be941104a5842" UNIQUE ("idempotencyKey"), CONSTRAINT "UQ_be58986a814923c8dd4e1a5112e" UNIQUE ("referenceCode"), CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "students" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "studentCode" character varying(20) NOT NULL, "fullName" character varying(100) NOT NULL, "email" character varying(100) NOT NULL, "phone" character varying(15), "faculty" character varying(50) NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "dateOfBirth" date, "mustChangePassword" boolean NOT NULL DEFAULT true, "passwordHash" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_7f8186b57a1bbb3ae0db6bd6262" UNIQUE ("studentCode"), CONSTRAINT "UQ_25985d58c714a4a427ced57507b" UNIQUE ("email"), CONSTRAINT "PK_7d7f07271ad4ce999880713f05e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."accounts_status_enum" AS ENUM('active', 'frozen', 'closed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "balance" integer NOT NULL DEFAULT '0', "dailyLimit" integer NOT NULL DEFAULT '0', "dailySpent" integer NOT NULL DEFAULT '0', "status" "public"."accounts_status_enum" NOT NULL DEFAULT 'active', "studentId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5a7a02c20412299d198e097a8fe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "admins" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "username" character varying(50) NOT NULL, "passwordHash" character varying(255) NOT NULL, "fullName" character varying(100) NOT NULL, "role" character varying(20) NOT NULL DEFAULT 'admin', "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_4ba6d0c734d53f8e1b2e24b6c56" UNIQUE ("username"), CONSTRAINT "PK_e3b38270c97a854c48d2e80874e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "cards" ADD CONSTRAINT "FK_49d83b8c9d1e3163231dfb6c913" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_a37b6cb6943f9c6b11dbfe168a0" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_26d8aec71ae9efbe468043cd2b9" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_88088ff46b6a3f09e1be51d35c4" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD CONSTRAINT "FK_59b495f928610e8667c6d9e12ce" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "accounts" DROP CONSTRAINT "FK_59b495f928610e8667c6d9e12ce"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_88088ff46b6a3f09e1be51d35c4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_26d8aec71ae9efbe468043cd2b9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_a37b6cb6943f9c6b11dbfe168a0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cards" DROP CONSTRAINT "FK_49d83b8c9d1e3163231dfb6c913"`,
    );
    await queryRunner.query(`DROP TABLE "admins"`);
    await queryRunner.query(`DROP TABLE "accounts"`);
    await queryRunner.query(`DROP TYPE "public"."accounts_status_enum"`);
    await queryRunner.query(`DROP TABLE "students"`);
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`DROP TYPE "public"."transactions_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."transactions_type_enum"`);
    await queryRunner.query(`DROP TABLE "merchants"`);
    await queryRunner.query(`DROP TYPE "public"."merchants_type_enum"`);
    await queryRunner.query(`DROP TABLE "cards"`);
    await queryRunner.query(`DROP TYPE "public"."cards_status_enum"`);
  }
}
