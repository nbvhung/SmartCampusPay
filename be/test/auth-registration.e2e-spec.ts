/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import { Client } from 'pg';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { ArchiveStudentWallets1791043200000 } from '../src/database/migrations/1791043200000-ArchiveStudentWallets';
import { RevealArchivedStudents1791129600000 } from '../src/database/migrations/1791129600000-RevealArchivedStudents';
import { StudentOnboarding1791216000000 } from '../src/database/migrations/1791216000000-StudentOnboarding';
import { Initial1785125994312 } from '../src/database/migrations/1785125994312-Initial';
import { HardenMoneyPath1790323200000 } from '../src/database/migrations/1790323200000-HardenMoneyPath';
import { PrepareHardwareIntegration1790899200000 } from '../src/database/migrations/1790899200000-PrepareHardwareIntegration';
import { AddTopupClaims1790956800000 } from '../src/database/migrations/1790956800000-AddTopupClaims';
import { Account } from '../src/modules/accounts/account.entity';
import { AdminsService } from '../src/modules/admins/admins.service';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { RegistrationOtpService } from '../src/modules/auth/registration-otp.service';
import { RegistrationOtpStore } from '../src/modules/auth/registration-otp.store';
import { RegistrationService } from '../src/modules/auth/registration.service';
import { Card, CardStatus } from '../src/modules/cards/card.entity';
import { Merchant } from '../src/modules/merchants/merchant.entity';
import {
  SendRegistrationOtpMessage,
  SmsSender,
} from '../src/modules/notifications/sms-sender';
import { RedisService } from '../src/modules/redis/redis.service';
import { Student } from '../src/modules/students/student.entity';
import { StudentsService } from '../src/modules/students/students.service';
import { Transaction } from '../src/modules/transactions/transaction.entity';

config({ quiet: true });
jest.setTimeout(60000);

class RecordingSmsSender extends SmsSender {
  readonly messages: SendRegistrationOtpMessage[] = [];

  sendRegistrationOtp(message: SendRegistrationOtpMessage): Promise<void> {
    this.messages.push({ ...message });
    return Promise.resolve();
  }

  clear(): void {
    this.messages.length = 0;
  }
}

describe('Student registration completion with PostgreSQL and Redis', () => {
  let app: INestApplication;
  let db: DataSource;
  let adminClient: Client;
  let redis: RedisService;
  let sender: RecordingSmsSender;
  let students: StudentsService;
  let auth: AuthService;
  let jwt: JwtService;
  let databaseCreated = false;

  const database = `scp_registration_${Date.now()}_${process.pid}`;
  const redisPrefix = `test:registration-completion:${Date.now()}:${process.pid}`;
  const phone = '0912345678';

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
    if (!/^scp_registration_\d+_\d+$/.test(database)) {
      throw new Error('Unsafe test database name');
    }
    await adminClient.query(`CREATE DATABASE "${database}"`);
    databaseCreated = true;

    db = new DataSource({
      type: 'postgres',
      ...connection,
      database,
      entities: [Student, Card, Account, Merchant, Transaction],
      migrations: [
        Initial1785125994312,
        HardenMoneyPath1790323200000,
        PrepareHardwareIntegration1790899200000,
        AddTopupClaims1790956800000,
        ArchiveStudentWallets1791043200000,
        RevealArchivedStudents1791129600000,
        StudentOnboarding1791216000000,
      ],
      synchronize: false,
    });
    await db.initialize();
    await db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await db.runMigrations();

    redis = new RedisService(
      new ConfigService({
        REDIS_HOST:
          process.env.TEST_REDIS_HOST ?? process.env.REDIS_HOST ?? 'localhost',
        REDIS_PORT: Number(
          process.env.TEST_REDIS_PORT ?? process.env.REDIS_PORT ?? 6379,
        ),
      }),
    );
    sender = new RecordingSmsSender();
    const appConfig = new ConfigService({
      NODE_ENV: 'test',
      JWT_ACCESS_SECRET: 'registration-access-secret',
      JWT_REFRESH_SECRET: 'registration-refresh-secret',
      OTP_HMAC_SECRET: 'registration-e2e-hmac-secret-at-least-32-bytes',
      OTP_REDIS_PREFIX: redisPrefix,
      OTP_TTL_SECONDS: 30,
      OTP_RESEND_COOLDOWN_SECONDS: 1,
      OTP_MAX_ATTEMPTS: 3,
      OTP_RATE_LIMIT_WINDOW_SECONDS: 60,
      OTP_RATE_LIMIT_PER_STUDENT: 100,
      OTP_RATE_LIMIT_PER_PHONE: 100,
      OTP_RATE_LIMIT_PER_CLIENT: 100,
    });
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        RegistrationService,
        RegistrationOtpService,
        RegistrationOtpStore,
        StudentsService,
        JwtService,
        { provide: ConfigService, useValue: appConfig },
        { provide: DataSource, useValue: db },
        { provide: RedisService, useValue: redis },
        { provide: SmsSender, useValue: sender },
        {
          provide: AdminsService,
          useValue: {
            findByUsername: jest.fn().mockResolvedValue(null),
            findById: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: getRepositoryToken(Student),
          useValue: db.getRepository(Student),
        },
      ],
    }).compile();

    students = module.get(StudentsService);
    auth = module.get(AuthService);
    jwt = module.get(JwtService);

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    if (redis.getClient().status !== 'ready') {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Integration Redis did not become ready')),
          5000,
        );
        redis.getClient().once('ready', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  });

  beforeEach(async () => {
    await db.query('TRUNCATE "cards", "accounts", "students" CASCADE');
    const keys = await redis.getClient().keys(`${redisPrefix}:*`);
    if (keys.length > 0) await redis.getClient().del(...keys);
    sender.clear();
  });

  afterAll(async () => {
    if (redis) {
      const keys = await redis.getClient().keys(`${redisPrefix}:*`);
      if (keys.length > 0) await redis.getClient().del(...keys);
    }
    if (app) await app.close();
    if (db?.isInitialized) await db.destroy();
    if (databaseCreated && /^scp_registration_\d+_\d+$/.test(database)) {
      await adminClient.query(`DROP DATABASE "${database}"`);
    }
    if (adminClient) await adminClient.end();
  });

  async function createStub(
    studentCode: string,
    options: { active?: boolean; withCard?: boolean } = {},
  ): Promise<Student> {
    const student = await db.getRepository(Student).save({
      studentCode,
      fullName: null,
      email: null,
      faculty: null,
      phone: null,
      isActive: options.active ?? true,
      mustChangePassword: true,
      passwordHash: null,
      registeredAt: null,
      profileCompletedAt: null,
    });
    if (options.withCard ?? true) {
      await db.getRepository(Card).save({
        uid: `CARD-${studentCode}`,
        studentId: student.id,
        status: CardStatus.ACTIVE,
        chipType: 'MIFARE',
      });
    }
    return student;
  }

  async function requestOtp(studentCode: string, requestedPhone = phone) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register/request-otp')
      .send({ studentCode, phone: requestedPhone })
      .expect(200);
    return {
      registrationId: response.body.data.registrationId as string,
      otp: sender.messages.at(-1)!.otp,
    };
  }

  async function register(studentCode: string, requestedPhone = phone) {
    const challenge = await requestOtp(studentCode, requestedPhone);
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register/verify')
      .send(challenge)
      .expect(200);
    return { challenge, response };
  }

  async function loadStudentWithPassword(id: string): Promise<Student> {
    return db
      .getRepository(Student)
      .createQueryBuilder('student')
      .addSelect('student.passwordHash')
      .where('student.id = :id', { id })
      .getOneOrFail();
  }

  it('runs the complete Phase 1 flow from physical-card provisioning to student login', async () => {
    const provisioned = await students.create({
      studentCode: ' svphase1001 ',
      cardUid: '04:a1:b2:c3:d4:e5:99',
    });

    const beforeRegistration = await loadStudentWithPassword(provisioned.id);
    const physicalCard = await db
      .getRepository(Card)
      .findOneByOrFail({ studentId: provisioned.id });
    expect(beforeRegistration).toMatchObject({
      studentCode: 'SVPHASE1001',
      phone: null,
      passwordHash: null,
      registeredAt: null,
    });
    expect(physicalCard.uid).toBe('04A1B2C3D4E599');
    expect(physicalCard.uid).not.toMatch(/^MOCK-/);
    expect(
      await db.getRepository(Account).countBy({ studentId: provisioned.id }),
    ).toBe(0);

    const { response: registrationResponse } = await register('SVPHASE1001');
    expect(registrationResponse.headers['set-cookie']).toBeUndefined();
    expect(
      await db.getRepository(Account).countBy({ studentId: provisioned.id }),
    ).toBe(1);

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ studentCode: 'SVPHASE1001', password: phone })
      .expect(200);
    expect(loginResponse.body.data).toMatchObject({
      mustChangePassword: true,
      user: { studentCode: 'SVPHASE1001', role: 'student' },
    });
    expect(loginResponse.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('access_token='),
        expect.stringContaining('refresh_token='),
      ]),
    );
  });

  it('completes registration atomically without auto login', async () => {
    const stub = await createStub('SVREG001');
    const { response } = await register(stub.studentCode);

    expect(response.body.data).toMatchObject({
      studentCode: stub.studentCode,
      mustChangePassword: true,
    });
    expect(response.headers['set-cookie']).toBeUndefined();

    const student = await loadStudentWithPassword(stub.id);
    const account = await db.getRepository(Account).findOneByOrFail({
      studentId: stub.id,
    });
    expect(student.phone).toBe(phone);
    expect(student.registeredAt).toBeInstanceOf(Date);
    expect(account.balance).toBe(0);
    expect(account.dailyLimit).toBe(500000);
  });

  it('does not write phone or create Account for a wrong OTP', async () => {
    const stub = await createStub('SVREG002');
    const challenge = await requestOtp(stub.studentCode);
    const wrongOtp = challenge.otp === '000000' ? '000001' : '000000';

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register/verify')
      .send({ registrationId: challenge.registrationId, otp: wrongOtp })
      .expect(400);
    expect(response.body.code).toBe('OTP_INCORRECT');

    const student = await loadStudentWithPassword(stub.id);
    expect(student.phone).toBeNull();
    expect(student.passwordHash).toBeNull();
    expect(
      await db.getRepository(Account).countBy({ studentId: stub.id }),
    ).toBe(0);
  });

  it('rejects an expired OTP without changing the database', async () => {
    const stub = await createStub('SVREG003');
    const challenge = await requestOtp(stub.studentCode);
    await redis
      .getClient()
      .expire(`${redisPrefix}:challenge:${challenge.registrationId}`, 1);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register/verify')
      .send(challenge)
      .expect(410);
    expect(response.body.code).toBe('OTP_EXPIRED');
    expect(
      await db.getRepository(Account).countBy({ studentId: stub.id }),
    ).toBe(0);
  });

  it('rechecks and rejects a Student made inactive after OTP issuance', async () => {
    const stub = await createStub('SVREG004');
    const challenge = await requestOtp(stub.studentCode);
    await db.getRepository(Student).update(stub.id, { isActive: false });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register/verify')
      .send(challenge)
      .expect(403);
    expect(response.body.code).toBe('REGISTRATION_STUDENT_INACTIVE');
    expect(
      await db.getRepository(Account).countBy({ studentId: stub.id }),
    ).toBe(0);
  });

  it('rechecks and rejects a Student whose physical card was removed', async () => {
    const stub = await createStub('SVREG005');
    const challenge = await requestOtp(stub.studentCode);
    await db.getRepository(Card).delete({ studentId: stub.id });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register/verify')
      .send(challenge)
      .expect(409);
    expect(response.body.code).toBe('REGISTRATION_PHYSICAL_CARD_REQUIRED');
    expect(
      await db.getRepository(Account).countBy({ studentId: stub.id }),
    ).toBe(0);
  });

  it('rejects duplicate registration and keeps exactly one Account', async () => {
    const stub = await createStub('SVREG006');
    const { challenge } = await register(stub.studentCode);

    await request(app.getHttpServer())
      .post('/api/v1/auth/register/verify')
      .send(challenge)
      .expect(410);
    expect(
      await db.getRepository(Account).countBy({ studentId: stub.id }),
    ).toBe(1);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register/request-otp')
      .send({ studentCode: stub.studentCode, phone })
      .expect(409);
    expect(response.body.code).toBe('REGISTRATION_ALREADY_COMPLETED');
  });

  it('allows only one concurrent verify to create an Account', async () => {
    const stub = await createStub('SVREG007');
    const challenge = await requestOtp(stub.studentCode);

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/auth/register/verify')
        .send(challenge),
      request(app.getHttpServer())
        .post('/api/v1/auth/register/verify')
        .send(challenge),
    ]);
    expect(
      responses.filter((response) => response.status === 200),
    ).toHaveLength(1);
    expect(
      responses.some((response) => [409, 410].includes(response.status)),
    ).toBe(true);
    expect(
      await db.getRepository(Account).countBy({ studentId: stub.id }),
    ).toBe(1);
  });

  it('rolls back Student and Account together and releases OTP for retry', async () => {
    const stub = await createStub('SVREG008');
    const challenge = await requestOtp(stub.studentCode);
    await db.query(`
      CREATE FUNCTION fail_registration_account_insert() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'test registration account failure';
      END;
      $$ LANGUAGE plpgsql
    `);
    await db.query(`
      CREATE TRIGGER fail_registration_account_insert_trigger
      BEFORE INSERT ON "accounts"
      FOR EACH ROW EXECUTE FUNCTION fail_registration_account_insert()
    `);

    try {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register/verify')
        .send(challenge)
        .expect(500);
    } finally {
      await db.query(
        'DROP TRIGGER IF EXISTS fail_registration_account_insert_trigger ON "accounts"',
      );
      await db.query(
        'DROP FUNCTION IF EXISTS fail_registration_account_insert()',
      );
    }

    const rolledBack = await loadStudentWithPassword(stub.id);
    expect(rolledBack.phone).toBeNull();
    expect(rolledBack.passwordHash).toBeNull();
    expect(rolledBack.registeredAt).toBeNull();
    expect(
      await db.getRepository(Account).countBy({ studentId: stub.id }),
    ).toBe(0);

    await request(app.getHttpServer())
      .post('/api/v1/auth/register/verify')
      .send(challenge)
      .expect(200);
    expect(
      await db.getRepository(Account).countBy({ studentId: stub.id }),
    ).toBe(1);
  });

  it('allows login with the verified phone as initial password', async () => {
    const stub = await createStub('SVREG009');
    await register(stub.studentCode);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ studentCode: stub.studentCode, password: phone })
      .expect(200);
    expect(response.body.data.mustChangePassword).toBe(true);
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('access_token='),
        expect.stringContaining('refresh_token='),
      ]),
    );
  });

  it('stores the initial phone password only as a bcrypt hash', async () => {
    const stub = await createStub('SVREG010');
    await register(stub.studentCode);

    const student = await loadStudentWithPassword(stub.id);
    expect(student.passwordHash).not.toBe(phone);
    await expect(bcrypt.compare(phone, student.passwordHash)).resolves.toBe(
      true,
    );
  });

  it('sets mustChangePassword to true on registration', async () => {
    const stub = await createStub('SVREG011');
    await register(stub.studentCode);

    const student = await db.getRepository(Student).findOneByOrFail({
      id: stub.id,
    });
    expect(student.mustChangePassword).toBe(true);
  });

  it('keeps legacy login compatible without creating Account or MOCK Card', async () => {
    const legacyPassword = 'legacy-password';
    const legacy = await db.getRepository(Student).save({
      studentCode: 'SVLEGACY1',
      fullName: 'Legacy Student',
      email: 'legacy@example.test',
      faculty: 'CNTT',
      phone: '0900000000',
      isActive: true,
      mustChangePassword: false,
      passwordHash: await bcrypt.hash(legacyPassword, 10),
      registeredAt: null,
      profileCompletedAt: null,
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ studentCode: legacy.studentCode, password: legacyPassword })
      .expect(200);

    expect(
      await db.getRepository(Account).countBy({ studentId: legacy.id }),
    ).toBe(0);
    expect(await db.getRepository(Card).countBy({ studentId: legacy.id })).toBe(
      0,
    );
  });

  it('requires the current password even during mandatory first-login change', async () => {
    const stub = await createStub('SVPHASE2001');
    await register(stub.studentCode);

    await expect(
      auth.changePassword(
        stub.id,
        'student',
        'wrong-current-password',
        'NewPassword123!',
        'first-login-wrong-jti',
        Math.floor(Date.now() / 1000) + 600,
      ),
    ).rejects.toThrow('Mật khẩu hiện tại không đúng');

    const unchanged = await loadStudentWithPassword(stub.id);
    expect(unchanged.mustChangePassword).toBe(true);
    await expect(bcrypt.compare(phone, unchanged.passwordHash)).resolves.toBe(
      true,
    );
  });

  it('rejects reusing the current password', async () => {
    const stub = await createStub('SVPHASE2002');
    await register(stub.studentCode);

    await expect(
      auth.changePassword(
        stub.id,
        'student',
        phone,
        phone,
        'first-login-reuse-jti',
        Math.floor(Date.now() / 1000) + 600,
      ),
    ).rejects.toMatchObject({
      response: { code: 'PASSWORD_REUSE_NOT_ALLOWED' },
    });

    const unchanged = await loadStudentWithPassword(stub.id);
    expect(unchanged.mustChangePassword).toBe(true);
  });

  it('changes the password, revokes the current session and requires login again', async () => {
    const stub = await createStub('SVPHASE2003');
    await register(stub.studentCode);
    const initialLogin = await auth.studentLogin(stub.studentCode, phone);
    const payload = jwt.verify<{
      jti: string;
      exp: number;
    }>(initialLogin.accessToken, {
      secret: 'registration-access-secret',
    });
    const newPassword = 'NewPassword123!';

    await expect(
      auth.changePassword(
        stub.id,
        'student',
        phone,
        newPassword,
        payload.jti,
        payload.exp,
      ),
    ).resolves.toMatchObject({
      message: expect.stringContaining('đăng nhập lại'),
    });

    const changed = await loadStudentWithPassword(stub.id);
    expect(changed.mustChangePassword).toBe(false);
    await expect(
      bcrypt.compare(newPassword, changed.passwordHash),
    ).resolves.toBe(true);
    expect(await redis.get(`refresh_token:${stub.id}`)).toBeNull();
    expect(await redis.get(`blacklist:${payload.jti}`)).toBe('1');

    await expect(auth.studentLogin(stub.studentCode, phone)).rejects.toThrow(
      'Mã sinh viên hoặc mật khẩu không đúng',
    );
    await expect(
      auth.studentLogin(stub.studentCode, newPassword),
    ).resolves.toMatchObject({ mustChangePassword: false });
  });
});
