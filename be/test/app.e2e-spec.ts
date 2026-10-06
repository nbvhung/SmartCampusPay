import 'reflect-metadata';
import { ArchiveStudentWallets1791043200000 } from '../src/database/migrations/1791043200000-ArchiveStudentWallets';
import { RevealArchivedStudents1791129600000 } from '../src/database/migrations/1791129600000-RevealArchivedStudents';
import { StudentOnboarding1791216000000 } from '../src/database/migrations/1791216000000-StudentOnboarding';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { Client } from 'pg';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import * as ExcelJS from 'exceljs';
import request from 'supertest';
import { config } from 'dotenv';
import { Student } from '../src/modules/students/student.entity';
import { Card, CardStatus } from '../src/modules/cards/card.entity';
import { Account, AccountStatus } from '../src/modules/accounts/account.entity';
import { Merchant } from '../src/modules/merchants/merchant.entity';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../src/modules/transactions/transaction.entity';
import {
  TopupPending,
  TopupPendingStatus,
} from '../src/modules/topup-pending/topup-pending.entity';
import { TransactionsService } from '../src/modules/transactions/transactions.service';
import { TransactionsController } from '../src/modules/transactions/transactions.controller';
import { CardsService } from '../src/modules/cards/cards.service';
import { AccountsService } from '../src/modules/accounts/accounts.service';
import { SePayService } from '../src/modules/sepay/sepay.service';
import { TopupPendingService } from '../src/modules/topup-pending/topup-pending.service';
import { ApiKeyGuard } from '../src/common/guards/api-key.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { JwtStrategy } from '../src/modules/auth/jwt.strategy';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { Initial1785125994312 } from '../src/database/migrations/1785125994312-Initial';
import { HardenMoneyPath1790323200000 } from '../src/database/migrations/1790323200000-HardenMoneyPath';
import { PrepareHardwareIntegration1790899200000 } from '../src/database/migrations/1790899200000-PrepareHardwareIntegration';
import { campusDate } from '../src/common/utils/payment';
import { RedisService } from '../src/modules/redis/redis.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HardwareDeviceController } from '../src/modules/hardware-device/hardware-device.controller';
import { HardwareDeviceService } from '../src/modules/hardware-device/hardware-device.service';
import { StudentsService } from '../src/modules/students/students.service';

config({ quiet: true });
jest.setTimeout(60000);

describe('Hardware payments with real PostgreSQL', () => {
  let app: INestApplication;
  let db: DataSource;
  let adminClient: Client;
  let databaseCreated = false;
  const database = `scp_integration_${Date.now()}_${process.pid}`;
  const apiKey = 'integration-device-key';
  let student: Student;
  let merchant: Merchant;
  let account: Account;
  let card: Card;
  let payments: TransactionsService;
  let accounts: AccountsService;
  let sepay: SePayService;
  let pending: TopupPendingService;
  let studentToken: string;
  let adminToken: string;
  let liveRedis: RedisService;
  let students: StudentsService;
  const redisFallback = {
    acquireLock: async () => 'fallback:integration',
    releaseLock: async () => undefined,
    get: async () => null,
  };

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
    if (!/^scp_integration_\d+_\d+$/.test(database))
      throw new Error('Unsafe test database name');
    await adminClient.query(`CREATE DATABASE "${database}"`);
    databaseCreated = true;
    db = new DataSource({
      type: 'postgres',
      ...connection,
      database,
      entities: [Student, Card, Account, Merchant, Transaction, TopupPending],
      migrations: [
        Initial1785125994312,
        HardenMoneyPath1790323200000,
        PrepareHardwareIntegration1790899200000,
        ArchiveStudentWallets1791043200000,
        RevealArchivedStudents1791129600000,
        StudentOnboarding1791216000000,
      ],
      synchronize: false,
    });
    await db.initialize();
    await db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await db.runMigrations();
    // No synchronize: the test validates the actual migration-created schema.
    const cards = new CardsService(db.getRepository(Card));
    students = new StudentsService(db.getRepository(Student), db);
    accounts = new AccountsService(db.getRepository(Account));
    pending = new TopupPendingService(db.getRepository(TopupPending), db);
    payments = new TransactionsService(
      db.getRepository(Transaction),
      cards,
      redisFallback as any,
      db,
    );
    sepay = new SePayService(
      new ConfigService({
        SEPAY_ACCOUNT_NUMBER: '123',
        SEPAY_WEBHOOK_ACCOUNT_NUMBER: '123',
        SEPAY_API_KEY: 'test',
      }),
      db,
      db.getRepository(Transaction),
      accounts,
      {
        findByCode: (code) =>
          db.getRepository(Student).findOneBy({ studentCode: code }),
      } as any,
      pending,
      redisFallback as any,
    );
    const module = await Test.createTestingModule({
      controllers: [TransactionsController, HardwareDeviceController],
      providers: [
        RolesGuard,
        ApiKeyGuard,
        { provide: TransactionsService, useValue: payments },
        {
          provide: HardwareDeviceService,
          useValue: new HardwareDeviceService(
            db.getRepository(Transaction),
            db.getRepository(Account),
            sepay,
            cards,
            {
              findByCode: (code) =>
                db.getRepository(Student).findOneBy({ studentCode: code }),
            } as any,
          ),
        },
        {
          provide: getRepositoryToken(Merchant),
          useValue: db.getRepository(Merchant),
        },
        {
          provide: JwtStrategy,
          useFactory: () =>
            new JwtStrategy(
              new ConfigService({ JWT_ACCESS_SECRET: 'integration-secret' }),
              db.getRepository(Student),
              {
                findById: async (id) => ({ id, role: 'admin', isActive: true }),
              } as any,
              redisFallback as any,
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
    liveRedis = new RedisService(
      new ConfigService({
        REDIS_HOST:
          process.env.TEST_REDIS_HOST ?? process.env.REDIS_HOST ?? 'localhost',
        REDIS_PORT: Number(
          process.env.TEST_REDIS_PORT ?? process.env.REDIS_PORT ?? 6379,
        ),
      }),
    );
    liveRedis.onModuleInit();
    if (liveRedis.getClient().status !== 'ready')
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Integration Redis did not become ready')),
          5000,
        );
        liveRedis.getClient().once('ready', () => {
          clearTimeout(timer);
          resolve();
        });
      });
  });

  beforeEach(async () => {
    await db.query(
      'TRUNCATE "topup_pendings", "transactions", "cards", "accounts", "students", "merchants" CASCADE',
    );
    student = await db.getRepository(Student).save({
      studentCode: 'B23DCCN358',
      fullName: 'Test Student',
      email: 'test@example.test',
      faculty: 'Test',
      mustChangePassword: false,
    });
    account = await db.getRepository(Account).save({
      studentId: student.id,
      balance: 100000,
      dailyLimit: 500000,
      dailySpent: 0,
      dailySpentDate: campusDate(),
    });
    merchant = await db
      .getRepository(Merchant)
      .save({ name: 'Test POS', apiKey: await bcrypt.hash(apiKey, 4) });
    card = await db
      .getRepository(Card)
      .save({ uid: '00A1B2C3', studentId: student.id });
    const jwt = new JwtService({ secret: 'integration-secret' });
    studentToken = jwt.sign({ sub: student.id, role: 'student' });
    adminToken = jwt.sign({ sub: randomUUID(), role: 'admin' });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (liveRedis) await liveRedis.onModuleDestroy();
    if (db?.isInitialized) await db.destroy();
    // Only drop the database generated and created by this suite.
    if (databaseCreated && /^scp_integration_\d+_\d+$/.test(database))
      await adminClient.query(`DROP DATABASE "${database}"`);
    if (adminClient) await adminClient.end();
  });

  const payRequest = (key = randomUUID(), amount = 25000) => ({
    cardUid: '00:a1:b2:c3',
    amount,
    idempotencyKey: key,
  });
  const pay = (body = payRequest()) =>
    request(app.getHttpServer())
      .post('/api/v1/transactions/pay/card')
      .set('X-API-Key', apiKey)
      .send(body);
  const balance = async () =>
    (await db.getRepository(Account).findOneByOrFail({ id: account.id }))
      .balance;
  const webhook = (
    id = 102,
    content = 'Nap tien B23DCCN358',
    amount = 50000,
  ) => ({
    id,
    transferType: 'in',
    transferAmount: amount,
    content,
    accountNumber: '123',
  });
  const qr = async (overrides: Partial<Transaction> = {}) =>
    db.getRepository(Transaction).save({
      studentId: student.id,
      studentCode: student.studentCode,
      accountId: account.id,
      amount: 50000,
      type: TransactionType.CREDIT,
      status: TransactionStatus.PENDING,
      referenceCode: 'SCPB23DCCN358ABCDEF',
      idempotencyKey: 'sepay_SCPB23DCCN358ABCDEF',
      expiresAt: new Date(Date.now() + 60000),
      ...overrides,
    });

  it('uses migrations on a clean database', async () => {
    expect(await db.showMigrations()).toBe(false);
    await expect(
      db.getRepository(Account).save({ studentId: student.id }),
    ).rejects.toMatchObject({ driverError: { code: '23505' } });
  });

  it('provisions a Student stub and physical Card without Account or password', async () => {
    const provisioned = await students.create({
      studentCode: ' b25dccn001 ',
      cardUid: '04:a1:b2:c3:d4:e5:80',
    });
    const persisted = await db
      .getRepository(Student)
      .createQueryBuilder('student')
      .addSelect('student.passwordHash')
      .where('student.id = :id', { id: provisioned.id })
      .getOneOrFail();
    const provisionedCard = await db
      .getRepository(Card)
      .findOneByOrFail({ studentId: provisioned.id });

    expect(persisted).toMatchObject({
      studentCode: 'B25DCCN001',
      fullName: null,
      email: null,
      faculty: null,
      registeredAt: null,
      profileCompletedAt: null,
      passwordHash: null,
    });
    expect(provisionedCard).toMatchObject({
      uid: '04A1B2C3D4E580',
      status: CardStatus.ACTIVE,
      studentId: provisioned.id,
    });
    expect(
      await db.getRepository(Account).countBy({ studentId: provisioned.id }),
    ).toBe(0);
  });

  it('rejects MOCK Card provisioning before creating a Student', async () => {
    await expect(
      students.create({
        studentCode: 'B25DCCN002',
        cardUid: 'MOCK-B25DCCN002',
      }),
    ).rejects.toMatchObject({ response: { code: 'PHYSICAL_CARD_REQUIRED' } });
    expect(
      await db.getRepository(Student).countBy({ studentCode: 'B25DCCN002' }),
    ).toBe(0);
  });

  it('rolls back the Student when the physical Card UID already exists', async () => {
    await expect(
      students.create({ studentCode: 'B25DCCN003', cardUid: card.uid }),
    ).rejects.toThrow('UID thẻ đã tồn tại');
    expect(
      await db.getRepository(Student).countBy({ studentCode: 'B25DCCN003' }),
    ).toBe(0);
  });

  it('imports MSSV and physical UID rows through the provisioning path', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Provisioning');
    sheet.addRow(['MSSV', 'UID thẻ vật lý']);
    sheet.addRow(['B25DCCN004', '04 11 22 33 44 55 66']);

    const result = await students.bulkImport(
      Buffer.from(await workbook.xlsx.writeBuffer()),
    );
    const imported = await db
      .getRepository(Student)
      .findOneByOrFail({ studentCode: 'B25DCCN004' });

    expect(result).toEqual({ created: 1, skipped: 0, errors: [] });
    expect(imported).toMatchObject({
      fullName: null,
      email: null,
      faculty: null,
    });
    expect(
      await db.getRepository(Card).findOneByOrFail({ studentId: imported.id }),
    ).toMatchObject({ uid: '04112233445566', status: CardStatus.ACTIVE });
    expect(
      await db.getRepository(Account).countBy({ studentId: imported.id }),
    ).toBe(0);
  });

  it('keeps legacy Student profile data and onboarding timestamps unset', async () => {
    const legacy = await db
      .getRepository(Student)
      .findOneByOrFail({ id: student.id });
    expect(legacy).toMatchObject({
      fullName: 'Test Student',
      email: 'test@example.test',
      faculty: 'Test',
      registeredAt: null,
      profileCompletedAt: null,
    });
  });

  it('upgrades an existing wallet without losing its daily counter', async () => {
    await db.undoLastMigration(); // StudentOnboarding
    await db.undoLastMigration(); // RevealArchivedStudents
    await db.undoLastMigration(); // ArchiveStudentWallets
    await db.undoLastMigration(); // PrepareHardwareIntegration
    await db.query('UPDATE accounts SET "dailySpent" = 1234');
    await db.query(`UPDATE cards SET uid = '00:a1:b2:c3'`);
    await db.runMigrations();
    const wallet = await db
      .getRepository(Account)
      .findOneByOrFail({ id: account.id });
    expect(wallet.dailySpent).toBe(1234);
    expect(wallet.dailySpentDate).toBe(campusDate());
    expect(
      (await db.getRepository(Card).findOneByOrFail({ id: card.id })).uid,
    ).toBe('00A1B2C3');
  });

  it('replays after a lost response and after card lock without a second debit', async () => {
    const body = payRequest();
    const first = await pay(body).expect(200);
    await db.getRepository(Card).update(card.id, { status: CardStatus.FROZEN });
    const second = await pay(body).expect(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(await balance()).toBe(75000);
    expect(await db.getRepository(Transaction).count()).toBe(1);
  });

  it('rejects a changed payload for the same key', async () => {
    const body = payRequest();
    await pay(body).expect(200);
    const result = await pay({ ...body, amount: 30000 }).expect(409);
    expect(result.body.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await balance()).toBe(75000);
  });

  it('allows only the originating merchant to look up a payment', async () => {
    const body = payRequest();
    await pay(body).expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/transactions/payments/${body.idempotencyKey}`)
      .set('X-API-Key', apiKey)
      .expect(200);
    await db
      .getRepository(Merchant)
      .save({ name: 'Other', apiKey: await bcrypt.hash('other-key', 4) });
    await request(app.getHttpServer())
      .get(`/api/v1/transactions/payments/${body.idempotencyKey}`)
      .set('X-API-Key', 'other-key')
      .expect(404);
  });

  it('serializes simultaneous retries without Redis', async () => {
    const body = payRequest(randomUUID(), 100000);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => pay(body)),
    );
    expect(results.every((result) => result.status === 200)).toBe(true);
    expect(new Set(results.map((result) => result.body.data.id)).size).toBe(1);
    expect(await balance()).toBe(0);
  });

  it('handles payment contention using real Redis and safe retries', async () => {
    const service = new TransactionsService(
      db.getRepository(Transaction),
      new CardsService(db.getRepository(Card)),
      liveRedis,
      db,
    );
    const key = randomUUID();
    await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        service.payByCard(card.uid, merchant.id, 100000, key),
      ),
    );
    const original = await service.payByCard(
      card.uid,
      merchant.id,
      100000,
      key,
    );
    expect(original.status).toBe(TransactionStatus.SUCCESS);
    expect(await balance()).toBe(0);
    expect(await db.getRepository(Transaction).count()).toBe(1);
  });

  it('does not release a Redis lock acquired by another owner after expiry', async () => {
    const key = `integration:${database}:${randomUUID()}`;
    const oldToken = await liveRedis.acquireLock(key, 1);
    expect(oldToken).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const newToken = await liveRedis.acquireLock(key, 10);
    expect(newToken).not.toBeNull();
    try {
      await liveRedis.releaseLock(key, oldToken!);
      expect(await liveRedis.getClient().get(`lock:${key}`)).toBe(newToken);
    } finally {
      await liveRedis.releaseLock(key, newToken!);
    }
  });

  it('prevents overdraft for simultaneous different keys', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => pay(payRequest(randomUUID(), 25000))),
    );
    expect(results.filter((result) => result.status === 200)).toHaveLength(4);
    expect(await balance()).toBe(0);
    expect(await db.getRepository(Transaction).count()).toBe(4);
  });

  it('rolls back the wallet when inserting a ledger entry fails', async () => {
    await db.query(
      `CREATE FUNCTION reject_test_debit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test ledger failure'; END $$`,
    );
    await db.query(
      'CREATE TRIGGER reject_test_debit BEFORE INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION reject_test_debit()',
    );
    try {
      const response = await pay().expect(500);
      expect(response.body).toMatchObject({
        success: false,
        data: null,
        code: 'INTERNAL_ERROR',
      });
      expect(await balance()).toBe(100000);
      expect(await db.getRepository(Transaction).count()).toBe(0);
    } finally {
      await db.query('DROP TRIGGER reject_test_debit ON transactions');
      await db.query('DROP FUNCTION reject_test_debit()');
    }
  });

  it('resets a missed daily counter under the wallet lock', async () => {
    await db
      .getRepository(Account)
      .update(account.id, { dailySpent: 500000, dailySpentDate: '2020-01-01' });
    await pay().expect(200);
    const wallet = await db
      .getRepository(Account)
      .findOneByOrFail({ id: account.id });
    expect(wallet.dailySpent).toBe(25000);
    expect(wallet.dailySpentDate).toBe(campusDate());
  });

  it('does not overwrite balance when freezing concurrently with pay', async () => {
    const [result] = await Promise.allSettled([
      payments.payByCard(card.uid, merchant.id, 25000, randomUUID()),
      accounts.toggleFreeze(account.id),
    ]);
    expect(await balance()).toBe(
      result.status === 'fulfilled' ? 75000 : 100000,
    );
    expect(
      (await db.getRepository(Account).findOneByOrFail({ id: account.id }))
        .status,
    ).toBe(AccountStatus.FROZEN);
  });

  it.each(['', 'wrong-key'])(
    'rejects an invalid device key %s',
    async (key) => {
      await request(app.getHttpServer())
        .post('/api/v1/transactions/pay/card')
        .set('X-API-Key', key)
        .send(payRequest())
        .expect(401);
    },
  );

  it('rejects fractional amounts and malformed UUIDs', async () => {
    await pay(payRequest(randomUUID(), 25000.5)).expect(400);
    await pay(payRequest('not-a-uuid')).expect(400);
    expect(await balance()).toBe(100000);
  });

  it('rejects locked cards, inactive students and revoked merchant keys', async () => {
    await db.getRepository(Card).update(card.id, { status: CardStatus.FROZEN });
    expect((await pay().expect(400)).body.code).toBe('CARD_INACTIVE');
    await db.getRepository(Card).update(card.id, { status: CardStatus.ACTIVE });
    await db.getRepository(Student).update(student.id, { isActive: false });
    expect((await pay().expect(400)).body.code).toBe('STUDENT_INACTIVE');
    await db.getRepository(Merchant).update(merchant.id, { isActive: false });
    await pay().expect(401);
    expect(await balance()).toBe(100000);
  });

  it('enforces daily limits for concurrent requests', async () => {
    await db.getRepository(Account).update(account.id, { dailyLimit: 50000 });
    const results = await Promise.all(Array.from({ length: 4 }, () => pay()));
    expect(results.filter((result) => result.status === 200)).toHaveLength(2);
    expect(
      results.filter((result) => result.body.code === 'DAILY_LIMIT_EXCEEDED'),
    ).toHaveLength(2);
    expect(await balance()).toBe(50000);
  });

  it('returns server balance using the device key and preserves leading UID zeros', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/v1/hardware/balance/00:a1:b2:c3')
      .set('X-API-Key', apiKey)
      .expect(200);
    expect(result.body.data.balance).toBe(100000);
  });

  it('scopes device QR status to the merchant and expires the QR on server', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/hardware/topup/qr')
      .set('X-API-Key', apiKey)
      .send({ cardUid: card.uid })
      .expect(200);
    const ref = created.body.data.referenceCode;
    await db
      .getRepository(Transaction)
      .update({ referenceCode: ref }, { expiresAt: new Date(0) });
    const result = await request(app.getHttpServer())
      .get(`/api/v1/hardware/topup/status/${ref}`)
      .set('X-API-Key', apiKey)
      .expect(200);
    expect(result.body.data.status).toBe('failed');
    await db
      .getRepository(Merchant)
      .save({ name: 'Other', apiKey: await bcrypt.hash('other-key', 4) });
    await request(app.getHttpServer())
      .get(`/api/v1/hardware/topup/status/${ref}`)
      .set('X-API-Key', 'other-key')
      .expect(404);
  });

  it('returns only the authenticated student transactions regardless of requested code', async () => {
    await pay().expect(200);
    const result = await request(app.getHttpServer())
      .get('/api/v1/transactions/student/SOME_OTHER_STUDENT')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    expect(result.body.data).toHaveLength(1);
    expect(result.body.data[0].studentId).toBe(student.id);
  });

  it.each([
    '/transactions',
    '/transactions/stats',
    '/transactions/stats/daily',
    '/transactions/chart',
  ])('forbids student access to %s', async (path) => {
    await request(app.getHttpServer())
      .get(`/api/v1${path}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1${path}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('caps the chart range', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/transactions/chart?days=100000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('credits one bank transfer once under simultaneous webhooks', async () => {
    await Promise.all(
      Array.from({ length: 8 }, () => sepay.handleWebhook(webhook())),
    );
    expect(await balance()).toBe(150000);
    expect(await db.getRepository(Transaction).count()).toBe(1);
    expect(await db.getRepository(TopupPending).count()).toBe(1);
  });

  it('serializes topup and pay on the same wallet', async () => {
    await Promise.all([
      sepay.handleWebhook(webhook()),
      payments.payByCard(card.uid, merchant.id, 25000, randomUUID()),
    ]);
    expect(await balance()).toBe(125000);
  });

  it('queues a second transfer into an already used QR', async () => {
    const payment = await qr();
    await sepay.handleWebhook(webhook(102, payment.referenceCode));
    await sepay.handleWebhook(webhook(103, payment.referenceCode));
    expect(await balance()).toBe(150000);
    expect(
      await db
        .getRepository(TopupPending)
        .findOneByOrFail({ transferId: '103' }),
    ).toMatchObject({
      status: 'pending',
      note: 'reference_already_used_or_cancelled',
    });
  });

  it.each([
    ['expired', { expiresAt: new Date(0) }, 'reference_expired'],
    [
      'cancelled',
      { status: TransactionStatus.FAILED },
      'reference_already_used_or_cancelled',
    ],
    ['wrong amount', { amount: 10000 }, 'amount_mismatch'],
  ] as const)(
    'queues a transfer for a %s QR',
    async (_name, overrides, reason) => {
      const payment = await qr(overrides);
      await sepay.handleWebhook(webhook(102, payment.referenceCode));
      expect(await balance()).toBe(100000);
      expect(
        await db
          .getRepository(TopupPending)
          .findOneByOrFail({ transferId: '102' }),
      ).toMatchObject({ status: 'pending', note: reason });
    },
  );

  it('coordinates cancellation with a simultaneous webhook', async () => {
    const payment = await qr();
    await Promise.all([
      sepay.cancelPayment(payment.referenceCode, student.id),
      sepay.handleWebhook(webhook(102, payment.referenceCode)),
    ]);
    const tx = await db
      .getRepository(Transaction)
      .findOneByOrFail({ id: payment.id });
    expect(await balance()).toBe(
      tx.status === TransactionStatus.SUCCESS ? 150000 : 100000,
    );
    expect(
      (
        await db
          .getRepository(TopupPending)
          .findOneByOrFail({ transferId: '102' })
      ).status,
    ).toBe(
      tx.status === TransactionStatus.SUCCESS
        ? TopupPendingStatus.MATCHED
        : TopupPendingStatus.PENDING,
    );
  });

  it('coordinates manual matching with a replayed webhook', async () => {
    const payload = webhook(102, 'No student code');
    await sepay.handleWebhook(payload);
    const transfer = await db
      .getRepository(TopupPending)
      .findOneByOrFail({ transferId: '102' });
    await Promise.all([
      pending.match(transfer.id, student.studentCode, 'test-admin'),
      sepay.handleWebhook(payload),
    ]);
    expect(await balance()).toBe(150000);
    expect(await db.getRepository(Transaction).count()).toBe(1);
  });

  it('rejects manual credit for an out-of-range transfer or wrong recipient', async () => {
    await sepay.handleWebhook(webhook(102, 'Unknown', 6000000));
    const tooLarge = await db
      .getRepository(TopupPending)
      .findOneByOrFail({ transferId: '102' });
    await expect(
      pending.match(tooLarge.id, student.studentCode, 'test-admin'),
    ).rejects.toThrow();
    await sepay.handleWebhook({ ...webhook(103), accountNumber: '456' });
    const wrongRecipient = await db
      .getRepository(TopupPending)
      .findOneByOrFail({ transferId: '103' });
    await expect(
      pending.match(wrongRecipient.id, student.studentCode, 'test-admin'),
    ).rejects.toThrow();
    expect(await balance()).toBe(100000);
  });

  it('serializes ignore and manual matching without inconsistent inbox status', async () => {
    await sepay.handleWebhook(webhook(102, 'Unknown'));
    const row = await db
      .getRepository(TopupPending)
      .findOneByOrFail({ transferId: '102' });
    await Promise.allSettled([
      pending.match(row.id, student.studentCode, 'test-admin'),
      pending.ignore(row.id, 'test-admin'),
    ]);
    const settled = await db
      .getRepository(TopupPending)
      .findOneByOrFail({ id: row.id });
    expect(await balance()).toBe(
      settled.status === TopupPendingStatus.MATCHED ? 150000 : 100000,
    );
  });
});
