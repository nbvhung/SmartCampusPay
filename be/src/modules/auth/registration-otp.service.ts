import {
  BadRequestException,
  ConflictException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { SmsSender } from '../notifications/sms-sender';
import {
  RegistrationOtpSettings,
  registrationOtpSettings,
} from './registration-otp.config';
import {
  CreateChallengeResult,
  RegistrationOtpRateKeys,
  RegistrationOtpStore,
  VerifyTransitionResult,
} from './registration-otp.store';
import {
  RegistrationOtpChallenge,
  RegistrationOtpResponse,
  RequestRegistrationOtpInput,
  VerifiedRegistrationIdentity,
} from './registration-otp.types';

@Injectable()
export class RegistrationOtpService {
  private readonly logger = new Logger(RegistrationOtpService.name);
  private readonly settings: RegistrationOtpSettings;
  private readonly hmacSecret: string;

  constructor(
    config: ConfigService,
    private readonly store: RegistrationOtpStore,
    private readonly smsSender: SmsSender,
  ) {
    this.settings = registrationOtpSettings(config);
    const environment = config.get<string>('NODE_ENV', 'development');
    const configuredSecret = this.settings.hmacSecret;

    if (configuredSecret && Buffer.byteLength(configuredSecret) >= 32) {
      this.hmacSecret = configuredSecret;
    } else if (environment === 'production') {
      throw new Error(
        'OTP_HMAC_SECRET must be configured with at least 32 bytes in production',
      );
    } else {
      this.hmacSecret = randomBytes(32).toString('hex');
      this.logger.warn(
        'OTP_HMAC_SECRET is missing or too short; using an ephemeral development secret',
      );
    }
  }

  requestOtp(
    input: RequestRegistrationOtpInput,
  ): Promise<RegistrationOtpResponse> {
    const normalized = this.normalizeInput(input);
    return this.issueOtp(normalized);
  }

  async resendOtp(
    registrationId: string,
    clientId?: string,
  ): Promise<RegistrationOtpResponse> {
    const normalizedRegistrationId =
      this.normalizeRegistrationId(registrationId);
    const challenge = await this.redisOperation(() =>
      this.store.getChallenge(
        this.settings.redisPrefix,
        normalizedRegistrationId,
      ),
    );
    this.assertUsableChallenge(challenge);

    return this.issueOtp(
      {
        studentId: challenge.studentId,
        phone: challenge.phone,
        clientId: clientId?.trim() || undefined,
      },
      normalizedRegistrationId,
    );
  }

  async verifyOtp(
    registrationId: string,
    otp: string,
  ): Promise<VerifiedRegistrationIdentity> {
    const normalizedRegistrationId =
      this.normalizeRegistrationId(registrationId);
    const challenge = await this.redisOperation(() =>
      this.store.getChallenge(
        this.settings.redisPrefix,
        normalizedRegistrationId,
      ),
    );
    this.assertUsableChallenge(challenge);

    if (!challenge.otpDigest) {
      throw this.unavailable();
    }

    const suppliedDigest = this.otpDigest(normalizedRegistrationId, otp);
    if (!this.constantTimeEqual(suppliedDigest, challenge.otpDigest)) {
      const failed = await this.redisOperation(() =>
        this.store.recordFailedAttempt(
          this.settings.redisPrefix,
          normalizedRegistrationId,
          challenge.otpDigest!,
        ),
      );
      this.throwForFailedAttempt(failed);
    }

    const verifiedAt = Date.now();
    const transition = await this.redisOperation(() =>
      this.store.markVerified(
        this.settings.redisPrefix,
        normalizedRegistrationId,
        challenge.otpDigest!,
        verifiedAt,
      ),
    );

    if (transition.state !== 'VERIFIED' || !transition.challenge) {
      this.throwForTransition(transition);
    }

    return {
      registrationId: normalizedRegistrationId,
      studentId: transition.challenge.studentId,
      phone: transition.challenge.phone,
      verifiedAt: transition.challenge.verifiedAt ?? verifiedAt,
    };
  }

  async consumeVerifiedOtp(registrationId: string): Promise<void> {
    const normalizedRegistrationId =
      this.normalizeRegistrationId(registrationId);
    const state = await this.redisOperation(() =>
      this.store.consumeVerified(
        this.settings.redisPrefix,
        normalizedRegistrationId,
      ),
    );
    if (state === 'CONSUMED' || state === 'MISSING') return;
    throw new ConflictException({
      code: 'OTP_NOT_VERIFIED',
      message: 'OTP chưa được xác minh',
    });
  }

  async releaseVerifiedOtp(registrationId: string): Promise<void> {
    const normalizedRegistrationId =
      this.normalizeRegistrationId(registrationId);
    const state = await this.redisOperation(() =>
      this.store.releaseVerified(
        this.settings.redisPrefix,
        normalizedRegistrationId,
      ),
    );
    if (
      state === 'RELEASED' ||
      state === 'ALREADY_PENDING' ||
      state === 'MISSING'
    ) {
      return;
    }
    throw new ConflictException({
      code: 'OTP_NOT_VERIFIED',
      message: 'OTP chưa được xác minh',
    });
  }

  private async issueOtp(
    input: RequestRegistrationOtpInput,
    expectedActiveId?: string,
  ): Promise<RegistrationOtpResponse> {
    const registrationId = randomBytes(32).toString('base64url');
    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const now = Date.now();
    const rateKeys = this.rateKeys(input);
    const challenge: RegistrationOtpChallenge = {
      version: 1,
      registrationId,
      studentId: input.studentId,
      phone: input.phone,
      otpDigest: this.otpDigest(registrationId, otp),
      attemptsRemaining: this.settings.maxAttempts,
      expiresAt: now + this.settings.ttlSeconds * 1000,
      resendAvailableAt: now + this.settings.resendCooldownSeconds * 1000,
      status: 'pending',
    };

    const created = await this.redisOperation(() =>
      this.store.createChallenge(
        this.settings.redisPrefix,
        challenge,
        rateKeys,
        {
          windowSeconds: this.settings.rateLimitWindowSeconds,
          perStudent: this.settings.rateLimitPerStudent,
          perPhone: this.settings.rateLimitPerPhone,
          perClient: this.settings.rateLimitPerClient,
        },
        this.settings.ttlSeconds,
        this.settings.resendCooldownSeconds,
        expectedActiveId,
      ),
    );
    this.assertChallengeCreated(created);

    try {
      await this.smsSender.sendRegistrationOtp({
        phone: input.phone,
        otp,
        expiresInSeconds: this.settings.ttlSeconds,
      });
    } catch {
      await this.bestEffortDiscard(registrationId, rateKeys.subject);
      throw new ServiceUnavailableException({
        code: 'SMS_UNAVAILABLE',
        message: 'Không thể gửi OTP lúc này, vui lòng thử lại sau',
      });
    }

    return {
      registrationId,
      expiresInSeconds: this.settings.ttlSeconds,
      resendAfterSeconds: this.settings.resendCooldownSeconds,
    };
  }

  private normalizeInput(
    input: RequestRegistrationOtpInput,
  ): RequestRegistrationOtpInput {
    const studentId = input.studentId.trim();
    const phone = input.phone.trim();
    if (!studentId || !phone) {
      throw new BadRequestException({
        code: 'INVALID_OTP_IDENTITY',
        message: 'Thông tin nhận OTP không hợp lệ',
      });
    }
    return {
      studentId,
      phone,
      clientId: input.clientId?.trim() || undefined,
    };
  }

  private normalizeRegistrationId(registrationId: string): string {
    const normalized = registrationId.trim();
    if (!/^[A-Za-z0-9_-]{40,128}$/.test(normalized)) {
      throw this.expired();
    }
    return normalized;
  }

  private assertUsableChallenge(
    challenge: RegistrationOtpChallenge | null,
  ): asserts challenge is RegistrationOtpChallenge {
    if (!challenge || challenge.expiresAt <= Date.now()) throw this.expired();
    if (challenge.status === 'exhausted') throw this.attemptsExhausted();
    if (challenge.status === 'verified') {
      throw new ConflictException({
        code: 'OTP_ALREADY_VERIFIED',
        message: 'OTP đã được xác minh',
      });
    }
    if (challenge.status !== 'pending') throw this.expired();
  }

  private assertChallengeCreated(result: CreateChallengeResult): void {
    if (result.state === 'OK') return;
    if (result.state === 'COOLDOWN') {
      throw new HttpException(
        {
          code: 'OTP_RESEND_COOLDOWN',
          message: 'Vui lòng chờ trước khi yêu cầu OTP mới',
          retryAfterSeconds: Math.max(result.retryAfterSeconds, 1),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (result.state.startsWith('RATE_')) {
      throw new HttpException(
        {
          code: 'OTP_RATE_LIMITED',
          message: 'Đã yêu cầu quá nhiều OTP, vui lòng thử lại sau',
          retryAfterSeconds: Math.max(result.retryAfterSeconds, 1),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (result.state === 'NOT_PENDING') {
      throw new ConflictException({
        code: 'OTP_NOT_PENDING',
        message: 'OTP không còn ở trạng thái chờ xác minh',
      });
    }
    throw this.expired();
  }

  private throwForFailedAttempt(result: VerifyTransitionResult): never {
    if (result.state === 'EXHAUSTED') throw this.attemptsExhausted();
    if (result.state === 'MISSING' || result.state === 'STALE') {
      throw this.expired();
    }
    throw new BadRequestException({
      code: 'OTP_INCORRECT',
      message: 'Mã OTP không đúng',
      attemptsRemaining: result.attemptsRemaining ?? 0,
    });
  }

  private throwForTransition(result: VerifyTransitionResult): never {
    if (result.state === 'EXHAUSTED') throw this.attemptsExhausted();
    if (result.state === 'ALREADY_VERIFIED') {
      throw new ConflictException({
        code: 'OTP_ALREADY_VERIFIED',
        message: 'OTP đã được xác minh',
      });
    }
    if (result.state === 'MISSING' || result.state === 'STALE') {
      throw this.expired();
    }
    throw this.unavailable();
  }

  private rateKeys(
    input: RequestRegistrationOtpInput,
  ): RegistrationOtpRateKeys {
    return {
      subject: this.identityDigest(
        'subject',
        `${input.studentId}\u0000${input.phone}`,
      ),
      student: this.identityDigest('student', input.studentId),
      phone: this.identityDigest('phone', input.phone),
      client: input.clientId
        ? this.identityDigest('client', input.clientId)
        : undefined,
    };
  }

  private otpDigest(registrationId: string, otp: string): string {
    return createHmac('sha256', this.hmacSecret)
      .update(`otp\u0000${registrationId}\u0000${otp}`)
      .digest('hex');
  }

  private identityDigest(type: string, value: string): string {
    return createHmac('sha256', this.hmacSecret)
      .update(`rate\u0000${type}\u0000${value}`)
      .digest('hex')
      .slice(0, 32);
  }

  private constantTimeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private async redisOperation<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Registration OTP Redis operation failed');
      throw this.unavailable();
    }
  }

  private async bestEffortDiscard(
    registrationId: string,
    subjectKey: string,
  ): Promise<void> {
    try {
      await this.store.discardChallenge(
        this.settings.redisPrefix,
        registrationId,
        subjectKey,
      );
    } catch {
      this.logger.error('Failed to clean up an undelivered OTP challenge');
    }
  }

  private expired(): GoneException {
    return new GoneException({
      code: 'OTP_EXPIRED',
      message: 'OTP đã hết hạn hoặc không còn hiệu lực',
    });
  }

  private attemptsExhausted(): HttpException {
    return new HttpException(
      {
        code: 'OTP_ATTEMPTS_EXHAUSTED',
        message: 'Đã nhập sai OTP quá số lần cho phép',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'OTP_SERVICE_UNAVAILABLE',
      message: 'Dịch vụ OTP tạm thời không khả dụng',
    });
  }
}
