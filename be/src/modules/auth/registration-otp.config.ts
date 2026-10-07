import { ConfigService } from '@nestjs/config';

export interface RegistrationOtpSettings {
  redisPrefix: string;
  hmacSecret?: string;
  ttlSeconds: number;
  resendCooldownSeconds: number;
  maxAttempts: number;
  rateLimitWindowSeconds: number;
  rateLimitPerStudent: number;
  rateLimitPerPhone: number;
  rateLimitPerClient: number;
}

function positiveInteger(
  config: ConfigService,
  name: string,
  fallback: number,
  maximum: number,
): number {
  const raw = config.get<string | number>(name, fallback);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

export function registrationOtpSettings(
  config: ConfigService,
): RegistrationOtpSettings {
  const redisPrefix = config
    .get<string>('OTP_REDIS_PREFIX', 'scp:registration-otp')
    .trim();
  if (!redisPrefix) throw new Error('OTP_REDIS_PREFIX must not be empty');

  return {
    redisPrefix,
    hmacSecret: config.get<string>('OTP_HMAC_SECRET')?.trim() || undefined,
    ttlSeconds: positiveInteger(config, 'OTP_TTL_SECONDS', 300, 3600),
    resendCooldownSeconds: positiveInteger(
      config,
      'OTP_RESEND_COOLDOWN_SECONDS',
      60,
      3600,
    ),
    maxAttempts: positiveInteger(config, 'OTP_MAX_ATTEMPTS', 5, 20),
    rateLimitWindowSeconds: positiveInteger(
      config,
      'OTP_RATE_LIMIT_WINDOW_SECONDS',
      3600,
      86400,
    ),
    rateLimitPerStudent: positiveInteger(
      config,
      'OTP_RATE_LIMIT_PER_STUDENT',
      5,
      100,
    ),
    rateLimitPerPhone: positiveInteger(
      config,
      'OTP_RATE_LIMIT_PER_PHONE',
      5,
      100,
    ),
    rateLimitPerClient: positiveInteger(
      config,
      'OTP_RATE_LIMIT_PER_CLIENT',
      20,
      1000,
    ),
  };
}
