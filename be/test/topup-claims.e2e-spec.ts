import { ArchiveStudentWallets1791043200000 } from '../src/database/migrations/1791043200000-ArchiveStudentWallets';
import { RevealArchivedStudents1791129600000 } from '../src/database/migrations/1791129600000-RevealArchivedStudents';
import { StudentOnboarding1791216000000 } from '../src/database/migrations/1791216000000-StudentOnboarding';
import { TransactionBalanceAudit1791302400000 } from '../src/database/migrations/1791302400000-TransactionBalanceAudit';
import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { Client } from 'pg';
import request from 'supertest';
import { config } from 'dotenv';
import { Student } from '../src/modules/students/student.entity';
import { Card } from '../src/modules/cards/card.entity';
import { Account, AccountStatus } from '../src/modules/accounts/account.entity';
import { AccountsService } from '../src/modules/accounts/accounts.service';
import { AccountsController } from '../src/modules/accounts/accounts.controller';
import { StudentsService } from '../src/modules/students/students.service';
import { StudentsController } from '../src/modules/students/students.controller';
import { CardsService } from '../src/modules/cards/cards.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { Merchant } from '../src/modules/merchants/merchant.entity';
import { Transaction } from '../src/modules/transactions/transaction.entity';
import { Admin } from '../src/modules/admins/admin.entity';
import {
  TopupPending,
  TopupPendingStatus,
} from '../src/modules/topup-pending/topup-pending.entity';
import { TopupPendingService } from '../src/modules/topup-pending/topup-pending.service';
import { TopupPendingController } from '../src/modules/topup-pending/topup-pending.controller';
import {
  TopupClaim,
  TopupClaimStatus,
} from '../src/modules/topup-claims/topup-claim.entity';
import { TopupClaimsService } from '../src/modules/topup-claims/topup-claims.service';
import { TopupClaimsController } from '../src/modules/topup-claims/topup-claims.controller';
import { JwtStrategy } from '../src/modules/auth/jwt.strategy';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { Initial1785125994312 } from '../src/database/migrations/1785125994312-Initial';
import { HardenMoneyPath1790323200000 } from '../src/database/migrations/1790323200000-HardenMoneyPath';
import { PrepareHardwareIntegration1790899200000 } from '../src/database/migrations/1790899200000-PrepareHardwareIntegration';
import { AddTopupClaims1790956800000 } from '../src/database/migrations/1790956800000-AddTopupClaims';

config({ quiet: true });
jest.setTimeout(60000);
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6e0AAAAASUVORK5CYII=',
  'base64',
);

describe('Student top-up claims with PostgreSQL', () => {
  let app: INestApplication;
  let db: DataSource;
  let adminClient: Client;
  let databaseCreated = false;
  const database = `scp_claims_${Date.now()}_${process.pid}`;
  let student: Student;
  let otherStudent: Student;
  let admin: Admin;
  let studentToken: string;
  let otherToken: string;
  let adminToken: string;
  let pending: TopupPendingService;
  let claims: TopupClaimsService;
  let accounts: AccountsService;
  let studentsService: StudentsService;
  let cardsService: CardsService;

  beforeAll(async () => {
    const connection = {
      host: process.env.TEST_DB_HOST ?? process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.TEST_DB_PORT ?? process.env.DB_PORT ?? 5432),
      username: process.env.TEST_DB_USER ?? process.env.DB_USER ?? 'postgres',
      password: process.env.TEST_DB_PASS ?? process.env.DB_PASS ?? 'postgres',
    };
    adminClient = new Client({
      ...connection,
      user: connection.username,
      database: 'postgres',
    });
    await adminClient.connect();
    if (!/^scp_claims_\d+_\d+$/.test(database))
      throw new Error('Unsafe test database name');
    await adminClient.query(`CREATE DATABASE "${database}"`);
    databaseCreated = true;
    db = new DataSource({
      type: 'postgres',
      ...connection,
      database,
      entities: [
        Student,
        Card,
        Account,
        Merchant,
        Transaction,
        Admin,
        TopupPending,
        TopupClaim,
      ],
      migrations: [
        Initial1785125994312,
        HardenMoneyPath1790323200000,
        PrepareHardwareIntegration1790899200000,
        AddTopupClaims1790956800000,
        ArchiveStudentWallets1791043200000,
        RevealArchivedStudents1791129600000,
        StudentOnboarding1791216000000,
        TransactionBalanceAudit1791302400000,
      ],
      synchronize: false,
    });
    await db.initialize();
    await db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await db.runMigrations();
    pending = new TopupPendingService(db.getRepository(TopupPending), db);
    claims = new TopupClaimsService(db.getRepository(TopupClaim), db, pending);
    accounts = new AccountsService(db.getRepository(Account));
    cardsService = new CardsService(db.getRepository(Card));
    studentsService = new StudentsService(db.getRepository(Student), db);
    const module = await Test.createTestingModule({
      controllers: [
        TopupClaimsController,
        TopupPendingController,
        AccountsController,
        StudentsController,
      ],
      providers: [
        RolesGuard,
        { provide: AccountsService, useValue: accounts },
        { provide: StudentsService, useValue: studentsService },
        { provide: TopupClaimsService, useValue: claims },
        { provide: TopupPendingService, useValue: pending },
        {
          provide: JwtStrategy,
          useFactory: () =>
            new JwtStrategy(
              new ConfigService({
                JWT_ACCESS_SECRET: 'claims-integration-secret',
              }),
              db.getRepository(Student),
              {
                findById: (id: string) =>
                  db.getRepository(Admin).findOneBy({ id }),
              } as any,
              { get: async () => null } as any,
            ),
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector)));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  beforeEach(async () => {
    await db.query(
      'TRUNCATE "topup_claims", "topup_pendings", "transactions", "cards", "accounts", "students", "admins" CASCADE',
    );
    const students = db.getRepository(Student);
    student = await students.save({
      studentCode: 'B23DCCN358',
      fullName: 'Test Student',
      email: 'student@example.test',
      faculty: 'Test',
      mustChangePassword: false,
    });
    otherStudent = await students.save({
      studentCode: 'B23DCCN359',
      fullName: 'Other Student',
      email: 'other@example.test',
      faculty: 'Test',
      mustChangePassword: false,
    });
    await db.getRepository(Card).save([
      { studentId: student.id, uid: '00A1B2C3' },
      { studentId: otherStudent.id, uid: '00A1B2C4' },
    ]);
    await db.getRepository(Account).save([
      { studentId: student.id, balance: 100000 },
      { studentId: otherStudent.id, balance: 0 },
    ]);
    admin = await db.getRepository(Admin).save({
      username: 'test-admin',
      fullName: 'Test Admin',
      passwordHash: 'unused',
    });
    const jwt = new JwtService({ secret: 'claims-integration-secret' });
    studentToken = jwt.sign({ sub: student.id, role: 'student' });
    otherToken = jwt.sign({ sub: otherStudent.id, role: 'student' });
    adminToken = jwt.sign({ sub: admin.id, role: 'admin' });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (db?.isInitialized) await db.destroy();
    if (databaseCreated && /^scp_claims_\d+_\d+$/.test(database))
      await adminClient.query(`DROP DATABASE "${database}"`);
    if (adminClient) await adminClient.end();
  });

  function submit(
    overrides: Record<string, string> = {},
    evidence: Buffer | null = png,
    token = studentToken,
    mime = 'image/png',
  ) {
    const fields = {
      fullName: student.fullName,
      studentCode: student.studentCode,
      cardUid: '00A1B2C3',
      amount: '50000',
      transferredAt: new Date(Date.now() - 60000).toISOString(),
      senderName: 'Parent Name',
      bankName: 'VCB',
      bankReference: 'BANK-REF-001',
      description: 'Forgot student code in transfer content',
      ...overrides,
    };
    const req = request(app.getHttpServer())
      .post('/api/v1/topup-claims')
      .auth(token, { type: 'bearer' });
    for (const [key, value] of Object.entries(fields)) req.field(key, value);
    if (evidence)
      req.attach('evidence', evidence, {
        filename: 'receipt.png',
        contentType: mime,
      });
    return req;
  }
  const transfer = (
    transferId = 'transfer-001',
    amount = 50000,
    note?: string,
  ) =>
    pending.createFromWebhook({
      transferId,
      amount,
      content: 'Deposit without student code',
      bankRef: 'BANK-REF-001',
      note,
    });
  const balance = async () =>
    (await db.getRepository(Account).findOneByOrFail({ studentId: student.id }))
      .balance;
  const match = (id: string, pendingId: string, token = adminToken) =>
    request(app.getHttpServer())
      .post(`/api/v1/topup-claims/${id}/match`)
      .auth(token, { type: 'bearer' })
      .send({ pendingId });

  it('persists multipart evidence and exposes only the owner’s claims', async () => {
    const { body } = await submit().expect(201);
    expect(body.data).toMatchObject({
      studentId: student.id,
      status: 'pending',
      amount: 50000,
      evidenceMime: 'image/png',
    });
    expect(body.data.evidence).toBeUndefined();
    expect(await balance()).toBe(100000);
    const own = await request(app.getHttpServer())
      .get('/api/v1/topup-claims')
      .auth(studentToken, { type: 'bearer' })
      .expect(200);
    expect(own.body.data.total).toBe(1);
    expect(own.body.data.items[0].evidence).toBeUndefined();
    const other = await request(app.getHttpServer())
      .get('/api/v1/topup-claims')
      .auth(otherToken, { type: 'bearer' })
      .expect(200);
    expect(other.body.data.total).toBe(0);
    await request(app.getHttpServer())
      .get(`/api/v1/topup-claims/${body.data.id}`)
      .auth(otherToken, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/topup-claims/${body.data.id}/evidence`)
      .auth(otherToken, { type: 'bearer' })
      .expect(404);
    for (const token of [studentToken, adminToken]) {
      const evidence = await request(app.getHttpServer())
        .get(`/api/v1/topup-claims/${body.data.id}/evidence`)
        .auth(token, { type: 'bearer' })
        .expect(200)
        .expect('Content-Type', /image\/png/);
      expect(evidence.body).toEqual(png);
      expect(evidence.headers['cache-control']).toBe('private, no-store');
    }
  });

  it('requires evidence, rejects spoofed files, oversized files and invalid identity', async () => {
    await submit({}, null).expect(400);
    await submit({}, Buffer.from('<svg>not a receipt</svg>')).expect(400);
    await submit({}, Buffer.alloc(5 * 1024 * 1024 + 1)).expect(413);
    await submit({ fullName: 'Fake Name' }).expect(400);
    await submit({ studentCode: otherStudent.studentCode }).expect(400);
    await submit({ cardUid: '00A1B2C4' }).expect(400);
    await submit({
      transferredAt: new Date(Date.now() + 3600000).toISOString(),
    }).expect(400);
    await submit({ amount: '1.5' }).expect(400);
    await submit({ bankReference: '' }).expect(400);
    expect(await db.getRepository(TopupClaim).count()).toBe(0);
  });

  it('rejects duplicate submissions even when concurrent', async () => {
    const results = await Promise.all([submit(), submit()]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(await db.getRepository(TopupClaim).count()).toBe(1);
  });

  it('enforces role permissions and removes direct matching without a claim', async () => {
    await request(app.getHttpServer()).get('/api/v1/topup-claims').expect(401);
    await submit({}, png, adminToken).expect(403);
    const { body } = await submit().expect(201);
    const pending = await transfer();
    await match(body.data.id, pending.id, studentToken).expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/topup-claims/${body.data.id}/candidates`)
      .auth(studentToken, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/topup-claims/${body.data.id}/reject`)
      .auth(studentToken, { type: 'bearer' })
      .send({ reason: 'Fake rejection' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/topup-pending/${pending.id}/match`)
      .auth(adminToken, { type: 'bearer' })
      .send({ studentCode: student.studentCode })
      .expect(404);
  });

  it('finds candidates and commits claim, transfer, transaction and wallet together', async () => {
    const { body } = await submit().expect(201);
    const pending = await transfer();
    await transfer('other-amount', 60000);
    const candidates = await request(app.getHttpServer())
      .get(`/api/v1/topup-claims/${body.data.id}/candidates?search=BANK-REF`)
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    expect(candidates.body.data.map((item: TopupPending) => item.id)).toEqual([
      pending.id,
    ]);
    const result = await match(body.data.id, pending.id).expect(201);
    expect(result.body.data).toMatchObject({
      status: 'matched',
      pendingId: pending.id,
      reviewedBy: admin.id,
    });
    expect(await balance()).toBe(150000);
    expect(await db.getRepository(Transaction).count()).toBe(1);
    expect(
      await db.getRepository(Transaction).findOneByOrFail({}),
    ).toMatchObject({
      balanceBefore: 100000,
      balanceAfter: 150000,
    });
    expect(
      (await db.getRepository(TopupPending).findOneByOrFail({ id: pending.id }))
        .status,
    ).toBe(TopupPendingStatus.MATCHED);
    const studentView = await request(app.getHttpServer())
      .get(`/api/v1/topup-claims/${body.data.id}`)
      .auth(studentToken, { type: 'bearer' })
      .expect(200);
    expect(studentView.body.data.reviewNote).toBeNull();
    expect(studentView.body.data.transactionId).toBeTruthy();
    await match(body.data.id, pending.id).expect(409);
    expect(await balance()).toBe(150000);
  });

  it('only credits once when two claims compete for the same transfer', async () => {
    const first = await submit().expect(201);
    const second = await submit({ bankReference: 'BANK-REF-002' }).expect(201);
    const pending = await transfer();
    const results = await Promise.all([
      match(first.body.data.id, pending.id),
      match(second.body.data.id, pending.id),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 400]);
    expect(await balance()).toBe(150000);
    expect(await db.getRepository(Transaction).count()).toBe(1);
    expect(
      await db
        .getRepository(TopupClaim)
        .countBy({ status: TopupClaimStatus.MATCHED }),
    ).toBe(1);
  });

  it('does not credit a wrong amount, wrong recipient or frozen wallet', async () => {
    const { body } = await submit().expect(201);
    await match(
      body.data.id,
      (await transfer('wrong-amount', 60000)).id,
    ).expect(400);
    await match(
      body.data.id,
      (await transfer('wrong-recipient', 50000, 'recipient_account_mismatch'))
        .id,
    ).expect(400);
    await db
      .getRepository(Account)
      .update({ studentId: student.id }, { status: AccountStatus.FROZEN });
    await match(body.data.id, (await transfer()).id).expect(400);
    expect(await balance()).toBe(100000);
    expect(await db.getRepository(Transaction).count()).toBe(0);
    expect((await claims.detail(body.data.id)).status).toBe('pending');
  });

  it('rolls back wallet and transfer if recording the review fails', async () => {
    const { body } = await submit().expect(201);
    const pending = await transfer();
    await expect(
      claims.match(
        body.data.id,
        pending.id,
        '00000000-0000-4000-8000-000000000000',
      ),
    ).rejects.toMatchObject({ driverError: { code: '23503' } });
    expect(await balance()).toBe(100000);
    expect(await db.getRepository(Transaction).count()).toBe(0);
    expect(
      (await db.getRepository(TopupPending).findOneByOrFail({ id: pending.id }))
        .status,
    ).toBe('pending');
    expect((await claims.detail(body.data.id)).status).toBe('pending');
  });

  it('returns rejection reasons to the owner and permits a corrected resubmission', async () => {
    const { body } = await submit().expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/topup-claims/${body.data.id}/reject`)
      .auth(adminToken, { type: 'bearer' })
      .send({ reason: '' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/v1/topup-claims/${body.data.id}/reject`)
      .auth(adminToken, { type: 'bearer' })
      .send({ reason: 'Please provide a clearer receipt' })
      .expect(201);
    const rejected = await claims.detail(body.data.id, student.id);
    expect(rejected).toMatchObject({
      status: 'rejected',
      reviewNote: 'Please provide a clearer receipt',
    });
    await match(body.data.id, (await transfer()).id).expect(409);
    await submit().expect(201);
    expect(await balance()).toBe(100000);
  });

  const remove = (resource: string, id: string, token = adminToken) =>
    request(app.getHttpServer())
      .delete(`/api/v1/${resource}/${id}`)
      .auth(token, { type: 'bearer' });

  it('keeps inactive students visible and blocks hard deletion when financial evidence exists', async () => {
    const { body } = await submit().expect(201);
    await match(body.data.id, (await transfer()).id).expect(201);
    // Represent a wallet whose funds have subsequently been settled.
    await db
      .getRepository(Account)
      .update({ studentId: student.id }, { balance: 0 });
    await request(app.getHttpServer())
      .patch(`/api/v1/students/${student.id}/toggle`)
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    await remove('students', student.id).expect(409);
    expect((await studentsService.findById(student.id)).isActive).toBe(false);
    expect(
      (await studentsService.findAll()).some((item) => item.id === student.id),
    ).toBe(true);
    expect(
      await db.getRepository(Account).countBy({ studentId: student.id }),
    ).toBe(1);
    expect(
      await db.getRepository(Card).countBy({ studentId: student.id }),
    ).toBe(1);
    expect(await db.getRepository(Transaction).count()).toBe(1);
    expect((await claims.detail(body.data.id)).status).toBe('matched');
    expect(
      await db.getRepository(Student).countBy({ id: otherStudent.id }),
    ).toBe(1);
    await request(app.getHttpServer())
      .get('/api/v1/topup-claims/mine')
      .auth(studentToken, { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/api/v1/students/${student.id}/toggle`)
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    expect((await studentsService.findById(student.id)).isActive).toBe(true);
  });

  it('hard-deletes a zero-balance wallet without history and permits a new wallet', async () => {
    const wallet = await accounts.findByStudentId(otherStudent.id);
    await remove('accounts', wallet.id).expect(200);
    expect(
      await db.getRepository(Student).countBy({ id: otherStudent.id }),
    ).toBe(1);
    expect(
      await db.getRepository(Card).countBy({ studentId: otherStudent.id }),
    ).toBe(1);
    await expect(
      accounts.findByStudentId(otherStudent.id),
    ).rejects.toMatchObject({ status: 404 });
    const replacement = await accounts.createAccountIfNotExists(
      otherStudent.id,
    );
    expect(replacement.id).not.toBe(wallet.id);
    await remove('accounts', wallet.id).expect(404);
    await remove('accounts', replacement.id).expect(200);
    await remove('students', otherStudent.id).expect(200);
    expect(
      await db.getRepository(Student).countBy({ id: otherStudent.id }),
    ).toBe(0);
    expect(
      await db.getRepository(Card).countBy({ studentId: otherStudent.id }),
    ).toBe(0);
  });

  it('rejects deleting nonzero balances without partially deleting children', async () => {
    const wallet = await accounts.findByStudentId(student.id);
    await remove('accounts', wallet.id).expect(409);
    await remove('students', student.id).expect(409);
    expect(await balance()).toBe(100000);
    expect(
      await db
        .getRepository(Student)
        .countBy({ id: student.id, isActive: true }),
    ).toBe(1);
    expect(
      await db.getRepository(Card).countBy({ studentId: student.id }),
    ).toBe(1);
  });

  it('validates delete IDs and enforces admin access', async () => {
    const wallet = await accounts.findByStudentId(otherStudent.id);
    for (const [resource, id] of [
      ['students', otherStudent.id],
      ['accounts', wallet.id],
    ]) {
      await request(app.getHttpServer())
        .delete(`/api/v1/${resource}/${id}`)
        .expect(401);
      await remove(resource, id, studentToken).expect(403);
      await remove(resource, 'bad-id').expect(400);
      await remove(resource, '00000000-0000-4000-8000-000000000000').expect(
        404,
      );
    }
  });

  it('rolls back all child deletions if deleting the student fails', async () => {
    await db.query(
      `CREATE FUNCTION reject_archive() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$`,
    );
    await db.query(
      `CREATE TRIGGER reject_archive BEFORE DELETE ON students FOR EACH ROW EXECUTE FUNCTION reject_archive()`,
    );
    try {
      await expect(studentsService.remove(otherStudent.id)).rejects.toThrow(
        'test rollback',
      );
      expect((await accounts.findByStudentId(otherStudent.id)).status).toBe(
        'active',
      );
      expect(
        (await cardsService.findByStudentId(otherStudent.id))[0].status,
      ).toBe('active');
      expect((await studentsService.findById(otherStudent.id)).isActive).toBe(
        true,
      );
    } finally {
      await db.query('DROP TRIGGER reject_archive ON students');
      await db.query('DROP FUNCTION reject_archive()');
    }
  });

  it('waits for an in-flight balance update before deciding whether a wallet can be deleted', async () => {
    const wallet = await accounts.findByStudentId(otherStudent.id);
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    let deletion: Promise<unknown> | undefined;
    try {
      await runner.manager.findOne(Account, {
        where: { id: wallet.id },
        lock: { mode: 'pessimistic_write' },
      });
      deletion = accounts.remove(wallet.id).then(
        () => null,
        (error: unknown) => error,
      );
      await runner.manager.update(Account, wallet.id, { balance: 50000 });
      await runner.commitTransaction();
      expect(await deletion).toMatchObject({ status: 409 });
      expect((await accounts.findByStudentId(otherStudent.id)).balance).toBe(
        50000,
      );
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
      if (deletion) await deletion;
    }
  });

  it('rejects refresh tokens belonging to inactive students', async () => {
    await studentsService.toggleActive(otherStudent.id);
    const jwt = new JwtService({ secret: 'refresh-test' });
    const auth = new AuthService(
      jwt,
      new ConfigService({ JWT_REFRESH_SECRET: 'refresh-test' }),
      {} as any,
      {} as any,
      db.getRepository(Student),
    );
    await expect(
      auth.refresh(jwt.sign({ sub: otherStudent.id, role: 'student' })),
    ).rejects.toMatchObject({ status: 401 });
  });
});
