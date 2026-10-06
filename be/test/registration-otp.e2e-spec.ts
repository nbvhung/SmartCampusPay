import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { RedisService } from '../src/modules/redis/redis.service';
import { RegistrationOtpService } from '../src/modules/auth/registration-otp.service';
import { RegistrationOtpStore } from '../src/modules/auth/registration-otp.store';
import {
  SendRegistrationOtpMessage,
  SmsSender,
} from '../src/modules/notifications/sms-sender';

jest.setTimeout(30000);

class RecordingSmsSender extends SmsSender {
  readonly messages: SendRegistrationOtpMessage[] = [];

  sendRegistrationOtp(message: SendRegistrationOtpMessage): Promise<void> {
    this.messages.push({ ...message });
    return Promise.resolve();
  }
}

describe('Registration OTP infrastructure with Redis', () => {
  let redis: RedisService;
  let prefix: string;

  const baseConfig = {
    NODE_ENV: 'test',
    OTP_HMAC_SECRET: 'test-registration-otp-secret-at-least-32-bytes',
    OTP_TTL_SECONDS: 5,
    OTP_RESEND_COOLDOWN_SECONDS: 1,
    OTP_MAX_ATTEMPTS: 3,
    OTP_RATE_LIMIT_WINDOW_SECONDS: 60,
    OTP_RATE_LIMIT_PER_STUDENT: 20,
    OTP_RATE_LIMIT_PER_PHONE: 20,
    OTP_RATE_LIMIT_PER_CLIENT: 20,
  };

  beforeAll(async () => {
    prefix = `test:registration-otp:${randomUUID()}`;
    redis = new RedisService(
      new ConfigService({
        REDIS_HOST:
          process.env.TEST_REDIS_HOST ?? process.env.REDIS_HOST ?? 'localhost',
        REDIS_PORT: Number(
          process.env.TEST_REDIS_PORT ?? process.env.REDIS_PORT ?? 6379,
        ),
      }),
    );
    redis.onModuleInit();
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

  afterEach(async () => {
    const keys = await redis.getClient().keys(`${prefix}:*`);
    if (keys.length > 0) await redis.getClient().del(...keys);
  });

  afterAll(async () => {
    const keys = await redis.getClient().keys(`${prefix}:*`);
    if (keys.length > 0) await redis.getClient().del(...keys);
    await redis.onModuleDestroy();
  });

  function createService(
    overrides: Record<string, string | number> = {},
    redisService: RedisService = redis,
  ) {
    const sender = new RecordingSmsSender();
    const config = new ConfigService({
      ...baseConfig,
      OTP_REDIS_PREFIX: prefix,
      ...overrides,
    });
    return {
      sender,
      service: new RegistrationOtpService(
        config,
        new RegistrationOtpStore(redisService),
        sender,
      ),
    };
  }

  async function expectErrorCode(
    operation: Promise<unknown>,
    code: string,
    status?: number,
  ): Promise<HttpException> {
    try {
      await operation;
      throw new Error(`Expected ${code}`);
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const exception = error as HttpException;
      expect(exception.getResponse()).toMatchObject({ code });
      if (status) expect(exception.getStatus()).toBe(status);
      return exception;
    }
  }

  it('creates an opaque challenge, stores only an HMAC and verifies the OTP', async () => {
    const { service, sender } = createService();
    const result = await service.requestOtp({
      studentId: 'student-001',
      phone: '0912345678',
      clientId: '127.0.0.1',
    });
    const sent = sender.messages.at(-1)!;
    const raw = await redis
      .getClient()
      .get(`${prefix}:challenge:${result.registrationId}`);
    const stored = JSON.parse(raw!) as Record<string, unknown>;

    expect(result.registrationId).toMatch(/^[A-Za-z0-9_-]{40,128}$/);
    expect(result.registrationId).not.toContain('student-001');
    expect(sent.otp).toMatch(/^\d{6}$/);
    expect(stored).not.toHaveProperty('otp');
    expect(stored.otpDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.otpDigest).not.toBe(sent.otp);
    expect(
      await redis
        .getClient()
        .ttl(`${prefix}:challenge:${result.registrationId}`),
    ).toBeGreaterThan(0);

    await expect(
      service.verifyOtp(result.registrationId, sent.otp),
    ).resolves.toMatchObject({
      registrationId: result.registrationId,
      studentId: 'student-001',
      phone: '0912345678',
    });
    expect(
      JSON.parse(
        (await redis
          .getClient()
          .get(`${prefix}:challenge:${result.registrationId}`))!,
      ),
    ).not.toHaveProperty('otpDigest');
  });

  it('expires a challenge using the Redis TTL', async () => {
    const { service, sender } = createService({ OTP_TTL_SECONDS: 1 });
    const result = await service.requestOtp({
      studentId: 'student-expiry',
      phone: '0900000001',
    });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await expectErrorCode(
      service.verifyOtp(result.registrationId, sender.messages[0].otp),
      'OTP_EXPIRED',
      410,
    );
  });

  it('decrements attempts for an incorrect OTP', async () => {
    const { service } = createService();
    const result = await service.requestOtp({
      studentId: 'student-wrong',
      phone: '0900000002',
    });
    const error = await expectErrorCode(
      service.verifyOtp(result.registrationId, 'not-the-code'),
      'OTP_INCORRECT',
      400,
    );
    expect(error.getResponse()).toMatchObject({ attemptsRemaining: 2 });
  });

  it('locks a challenge after the maximum number of incorrect attempts', async () => {
    const { service, sender } = createService({ OTP_MAX_ATTEMPTS: 2 });
    const result = await service.requestOtp({
      studentId: 'student-attempts',
      phone: '0900000003',
    });
    await expectErrorCode(
      service.verifyOtp(result.registrationId, 'wrong-1'),
      'OTP_INCORRECT',
    );
    await expectErrorCode(
      service.verifyOtp(result.registrationId, 'wrong-2'),
      'OTP_ATTEMPTS_EXHAUSTED',
      429,
    );
    await expectErrorCode(
      service.verifyOtp(result.registrationId, sender.messages[0].otp),
      'OTP_ATTEMPTS_EXHAUSTED',
      429,
    );
  });

  it('enforces resend cooldown and invalidates the previous challenge and OTP', async () => {
    const { service, sender } = createService();
    const first = await service.requestOtp({
      studentId: 'student-resend',
      phone: '0900000004',
      clientId: 'client-resend',
    });
    const firstOtp = sender.messages[0].otp;

    await expectErrorCode(
      service.resendOtp(first.registrationId, 'client-resend'),
      'OTP_RESEND_COOLDOWN',
      429,
    );
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const second = await service.resendOtp(
      first.registrationId,
      'client-resend',
    );
    const secondOtp = sender.messages[1].otp;
    expect(second.registrationId).not.toBe(first.registrationId);
    await expectErrorCode(
      service.verifyOtp(first.registrationId, firstOtp),
      'OTP_EXPIRED',
    );
    await expect(
      service.verifyOtp(second.registrationId, secondOtp),
    ).resolves.toMatchObject({ studentId: 'student-resend' });
  });

  it('rate limits repeated requests by phone across different students', async () => {
    const { service, sender } = createService({
      OTP_RATE_LIMIT_PER_PHONE: 2,
      OTP_RATE_LIMIT_PER_STUDENT: 10,
      OTP_RATE_LIMIT_PER_CLIENT: 10,
    });
    await service.requestOtp({
      studentId: 'rate-student-1',
      phone: '0900000005',
      clientId: 'rate-client-1',
    });
    await service.requestOtp({
      studentId: 'rate-student-2',
      phone: '0900000005',
      clientId: 'rate-client-2',
    });
    await expectErrorCode(
      service.requestOtp({
        studentId: 'rate-student-3',
        phone: '0900000005',
        clientId: 'rate-client-3',
      }),
      'OTP_RATE_LIMITED',
      429,
    );
    expect(sender.messages).toHaveLength(2);
  });

  it('fails closed and does not send SMS when Redis is unavailable', async () => {
    const unavailableRedis = {
      getClient: () => ({
        eval: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
      }),
    } as unknown as RedisService;
    const { service, sender } = createService({}, unavailableRedis);

    await expectErrorCode(
      service.requestOtp({
        studentId: 'student-redis-down',
        phone: '0900000006',
      }),
      'OTP_SERVICE_UNAVAILABLE',
      503,
    );
    expect(sender.messages).toHaveLength(0);
  });
});
