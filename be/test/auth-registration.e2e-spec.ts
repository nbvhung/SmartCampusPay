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
import { TransactionBalanceAudit1791302400000 } from '../src/database/migrations/1791302400000-TransactionBalanceAudit';
import { Initial1785125994312 } from '../src/database/migrations/1785125994312-Initial';
import { HardenMoneyPath1790323200000 } from '../src/database/migrations/1790323200000-HardenMoneyPath';
import { PrepareHardwareIntegration1790899200000 } from '../src/database/migrations/1790899200000-PrepareHardwareIntegration';
import { AddTopupClaims1790956800000 } from '../src/database/migrations/1790956800000-AddTopupClaims';
import { Account } from '../src/modules/accounts/account.entity';
import { AdminsService } from '../src/modules/admins/admins.service';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { JwtStrategy } from '../src/modules/auth/jwt.strategy';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { Reflector } from '@nestjs/core';
import { Card } from '../src/modules/cards/card.entity';
import { Merchant } from '../src/modules/merchants/merchant.entity';
import { RedisService } from '../src/modules/redis/redis.service';
import { Student } from '../src/modules/students/student.entity';
import { StudentsService } from '../src/modules/students/students.service';
import { Transaction } from '../src/modules/transactions/transaction.entity';

config({ quiet: true });
jest.setTimeout(60000);

describe('Provisioned first login with PostgreSQL and Redis', () => {
  let app: INestApplication;
  let db: DataSource;
  let adminClient: Client;
  let redis: RedisService;
  let students: StudentsService;
  let auth: AuthService;
  let databaseCreated = false;

  const database = `scp_registration_${Date.now()}_${process.pid}`;
  const redisPrefix = `test:registration-completion:${Date.now()}:${process.pid}`;
  const password = 'ChosenPassword123!';

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
        TransactionBalanceAudit1791302400000,
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
    const appConfig = new ConfigService({
      NODE_ENV: 'test',
      JWT_ACCESS_SECRET: 'registration-access-secret',
      JWT_REFRESH_SECRET: 'registration-refresh-secret',
    });
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        JwtStrategy,
        StudentsService,
        JwtService,
        { provide: ConfigService, useValue: appConfig },
        { provide: DataSource, useValue: db },
        { provide: RedisService, useValue: redis },
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
    app.useGlobalGuards(new JwtAuthGuard(module.get(Reflector)));
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

  it('creates a wallet and hashes uppercase MSSV without exposing the hash', async () => {
    const student = await students.create({
      studentCode: ' sv00001 ',
      cardUid: '00112233',
      fullName: 'Test Student',
    });
    expect(student.passwordHash).toBeUndefined();
    const stored = await db
      .getRepository(Student)
      .createQueryBuilder('s')
      .addSelect('s.passwordHash')
      .where('s.id = :id', { id: student.id })
      .getOneOrFail();
    expect(await bcrypt.compare('SV00001', stored.passwordHash)).toBe(true);
    expect(stored.mustChangePassword).toBe(true);
    expect(
      (
        await db
          .getRepository(Account)
          .findOneByOrFail({ studentId: student.id })
      ).balance,
    ).toBe(0);
  });

  it('requires changing the initial password, revokes it, and preserves money', async () => {
    const student = await students.create({
      studentCode: 'SV00002',
      cardUid: '00112234',
    });
    await db
      .getRepository(Account)
      .update({ studentId: student.id }, { balance: 12345 });
    await expect(auth.studentLogin('SV00002', 'sv00002')).rejects.toThrow();
    const login = await auth.studentLogin('sv00002', 'SV00002');
    expect(login.mustChangePassword).toBe(true);
    for (const weak of [
      'password1!',
      'PASSWORD1!',
      'Password!!',
      'Password12',
      'Aa1!',
    ]) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${login.accessToken}`)
        .send({ oldPassword: 'SV00002', newPassword: weak })
        .expect(400);
    }
    await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .send({ oldPassword: 'wrong', newPassword: password })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .send({ oldPassword: 'SV00002', newPassword: password })
      .expect(200);
    await expect(auth.studentLogin('SV00002', 'SV00002')).rejects.toThrow();
    expect(
      (await auth.studentLogin('SV00002', password)).mustChangePassword,
    ).toBe(false);
    expect(
      (await db.getRepository(Student).findOneByOrFail({ id: student.id }))
        .registeredAt,
    ).toBeInstanceOf(Date);
    expect(
      (
        await db
          .getRepository(Account)
          .findOneByOrFail({ studentId: student.id })
      ).balance,
    ).toBe(12345);
    expect(
      await db.getRepository(Account).countBy({ studentId: student.id }),
    ).toBe(1);
  });

  it('supports previously provisioned passwordless rows without OTP', async () => {
    await db.getRepository(Student).save({
      studentCode: 'SV00003',
      mustChangePassword: true,
      isActive: true,
    });
    await expect(auth.studentLogin('SV00003', 'wrong')).rejects.toThrow();
    expect(
      (await auth.studentLogin('SV00003', 'SV00003')).mustChangePassword,
    ).toBe(true);
    expect(await db.getRepository(Account).count()).toBe(1);
  });

  it('converts an older initial password to uppercase MSSV without changing an existing wallet', async () => {
    const student = await students.create({
      studentCode: 'SV00005',
      cardUid: '00112236',
    });
    await db.getRepository(Student).update(student.id, {
      passwordHash: await bcrypt.hash('0912345678', 10),
    });
    await db
      .getRepository(Account)
      .update({ studentId: student.id }, { balance: 7000 });
    await expect(auth.studentLogin('SV00005', '0912345678')).rejects.toThrow();
    expect(
      (await auth.studentLogin('sv00005', 'SV00005')).mustChangePassword,
    ).toBe(true);
    expect(
      (
        await db
          .getRepository(Account)
          .findOneByOrFail({ studentId: student.id })
      ).balance,
    ).toBe(7000);
    expect(
      await db.getRepository(Account).countBy({ studentId: student.id }),
    ).toBe(1);
  });

  it('never resets existing credentials or enables inactive students', async () => {
    const student = await students.create({
      studentCode: 'SV00004',
      cardUid: '00112235',
    });
    await db.getRepository(Student).update(student.id, {
      passwordHash: await bcrypt.hash(password, 10),
      mustChangePassword: false,
    });
    await expect(auth.studentLogin('SV00004', 'SV00004')).rejects.toThrow();
    expect(
      (await auth.studentLogin('SV00004', password)).mustChangePassword,
    ).toBe(false);
    await db.getRepository(Student).update(student.id, { isActive: false });
    await expect(auth.studentLogin('SV00004', password)).rejects.toThrow();
  });

  it('does not expose retired registration or Microsoft routes', async () => {
    for (const path of [
      'register/request-otp',
      'register/verify',
      'register/complete',
    ]) {
      const result = await request(app.getHttpServer())
        .post(`/api/v1/auth/${path}`)
        .send({});
      expect([401, 404]).toContain(result.status);
    }
    expect(
      (await request(app.getHttpServer()).get('/api/v1/auth/ptit/start'))
        .status,
    ).not.toBe(302);
  });
});
