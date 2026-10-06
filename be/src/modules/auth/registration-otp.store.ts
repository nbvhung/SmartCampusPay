import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { RegistrationOtpChallenge } from './registration-otp.types';

const CREATE_CHALLENGE_SCRIPT = `
local activeId = redis.call('GET', KEYS[2])
local expectedActiveId = ARGV[9]

if expectedActiveId ~= '' then
  if activeId ~= expectedActiveId then
    return {'STALE', '0'}
  end
  local previousRaw = redis.call('GET', ARGV[10] .. expectedActiveId)
  if not previousRaw then
    return {'MISSING', '0'}
  end
  local previous = cjson.decode(previousRaw)
  if previous.status ~= 'pending' then
    return {'NOT_PENDING', '0'}
  end
end

local cooldownTtl = redis.call('TTL', KEYS[3])
if cooldownTtl > 0 then
  return {'COOLDOWN', tostring(cooldownTtl)}
end

local rateKeys = {KEYS[4], KEYS[5], KEYS[6]}
local rateCodes = {'RATE_STUDENT', 'RATE_PHONE', 'RATE_CLIENT'}
local limits = {tonumber(ARGV[5]), tonumber(ARGV[6]), tonumber(ARGV[7])}
local rateKeyCount = ARGV[11] == '1' and 3 or 2

for index = 1, rateKeyCount do
  local current = tonumber(redis.call('GET', rateKeys[index]) or '0')
  if current >= limits[index] then
    local retryAfter = redis.call('TTL', rateKeys[index])
    return {rateCodes[index], tostring(math.max(retryAfter, 1))}
  end
end

for index = 1, rateKeyCount do
  local count = redis.call('INCR', rateKeys[index])
  if count == 1 then
    redis.call('EXPIRE', rateKeys[index], tonumber(ARGV[4]))
  end
end

if activeId then
  redis.call('DEL', ARGV[10] .. activeId)
end

redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[2]))
redis.call('SET', KEYS[2], ARGV[8], 'EX', tonumber(ARGV[2]))
redis.call('SET', KEYS[3], '1', 'EX', tonumber(ARGV[3]))
return {'OK', '0'}
`;

const MARK_VERIFIED_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'MISSING', ''} end
local challenge = cjson.decode(raw)
if challenge.status == 'verified' then return {'ALREADY_VERIFIED', raw} end
if challenge.status == 'exhausted' then return {'EXHAUSTED', raw} end
if challenge.status ~= 'pending' or challenge.otpDigest ~= ARGV[1] then
  return {'STALE', raw}
end
challenge.status = 'verified'
challenge.verifiedAt = tonumber(ARGV[2])
challenge.verifiedDigest = challenge.otpDigest
challenge.otpDigest = nil
local encoded = cjson.encode(challenge)
redis.call('SET', KEYS[1], encoded, 'KEEPTTL')
return {'VERIFIED', encoded}
`;

const RECORD_FAILURE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'MISSING', '0'} end
local challenge = cjson.decode(raw)
if challenge.status == 'exhausted' then return {'EXHAUSTED', '0'} end
if challenge.status ~= 'pending' or challenge.otpDigest ~= ARGV[1] then
  return {'STALE', tostring(challenge.attemptsRemaining or 0)}
end
challenge.attemptsRemaining = math.max(tonumber(challenge.attemptsRemaining) - 1, 0)
if challenge.attemptsRemaining == 0 then
  challenge.status = 'exhausted'
  challenge.otpDigest = nil
end
redis.call('SET', KEYS[1], cjson.encode(challenge), 'KEEPTTL')
if challenge.status == 'exhausted' then return {'EXHAUSTED', '0'} end
return {'INCORRECT', tostring(challenge.attemptsRemaining)}
`;

const CONSUME_VERIFIED_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 'MISSING' end
local challenge = cjson.decode(raw)
if challenge.status ~= 'verified' then return 'NOT_VERIFIED' end
redis.call('DEL', KEYS[1])
return 'CONSUMED'
`;

const RELEASE_VERIFIED_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 'MISSING' end
local challenge = cjson.decode(raw)
if challenge.status == 'pending' then return 'ALREADY_PENDING' end
if challenge.status ~= 'verified' or not challenge.verifiedDigest then
  return 'NOT_VERIFIED'
end
challenge.status = 'pending'
challenge.otpDigest = challenge.verifiedDigest
challenge.verifiedDigest = nil
challenge.verifiedAt = nil
redis.call('SET', KEYS[1], cjson.encode(challenge), 'KEEPTTL')
return 'RELEASED'
`;

const DISCARD_SCRIPT = `
redis.call('DEL', KEYS[1])
if redis.call('GET', KEYS[2]) == ARGV[1] then
  redis.call('DEL', KEYS[2])
end
redis.call('DEL', KEYS[3])
return 1
`;

export interface RegistrationOtpRateKeys {
  subject: string;
  student: string;
  phone: string;
  client?: string;
}

export interface RegistrationOtpRateLimits {
  windowSeconds: number;
  perStudent: number;
  perPhone: number;
  perClient: number;
}

export type CreateChallengeState =
  | 'OK'
  | 'COOLDOWN'
  | 'RATE_STUDENT'
  | 'RATE_PHONE'
  | 'RATE_CLIENT'
  | 'STALE'
  | 'MISSING'
  | 'NOT_PENDING';

export interface CreateChallengeResult {
  state: CreateChallengeState;
  retryAfterSeconds: number;
}

export type VerifyTransitionState =
  | 'VERIFIED'
  | 'ALREADY_VERIFIED'
  | 'EXHAUSTED'
  | 'INCORRECT'
  | 'STALE'
  | 'MISSING';

export interface VerifyTransitionResult {
  state: VerifyTransitionState;
  challenge?: RegistrationOtpChallenge;
  attemptsRemaining?: number;
}

export type FinalizeChallengeState =
  'CONSUMED' | 'RELEASED' | 'ALREADY_PENDING' | 'NOT_VERIFIED' | 'MISSING';

@Injectable()
export class RegistrationOtpStore {
  constructor(private readonly redis: RedisService) {}

  async createChallenge(
    prefix: string,
    challenge: RegistrationOtpChallenge,
    rateKeys: RegistrationOtpRateKeys,
    limits: RegistrationOtpRateLimits,
    ttlSeconds: number,
    cooldownSeconds: number,
    expectedActiveId?: string,
  ): Promise<CreateChallengeResult> {
    const result = await this.redis
      .getClient()
      .eval(
        CREATE_CHALLENGE_SCRIPT,
        6,
        this.challengeKey(prefix, challenge.registrationId),
        this.activeKey(prefix, rateKeys.subject),
        this.cooldownKey(prefix, rateKeys.subject),
        this.rateKey(prefix, 'student', rateKeys.student),
        this.rateKey(prefix, 'phone', rateKeys.phone),
        this.rateKey(
          prefix,
          'client',
          rateKeys.client ?? `unused:${challenge.registrationId}`,
        ),
        JSON.stringify(challenge),
        String(ttlSeconds),
        String(cooldownSeconds),
        String(limits.windowSeconds),
        String(limits.perStudent),
        String(limits.perPhone),
        String(limits.perClient),
        challenge.registrationId,
        expectedActiveId ?? '',
        `${prefix}:challenge:`,
        rateKeys.client ? '1' : '0',
      );
    const [state, retryAfter = '0'] = this.arrayResult(result);
    return {
      state: state as CreateChallengeState,
      retryAfterSeconds: Number(retryAfter),
    };
  }

  async getChallenge(
    prefix: string,
    registrationId: string,
  ): Promise<RegistrationOtpChallenge | null> {
    const raw = await this.redis
      .getClient()
      .get(this.challengeKey(prefix, registrationId));
    if (!raw) return null;
    return JSON.parse(raw) as RegistrationOtpChallenge;
  }

  async markVerified(
    prefix: string,
    registrationId: string,
    expectedDigest: string,
    verifiedAt: number,
  ): Promise<VerifyTransitionResult> {
    const result = await this.redis
      .getClient()
      .eval(
        MARK_VERIFIED_SCRIPT,
        1,
        this.challengeKey(prefix, registrationId),
        expectedDigest,
        String(verifiedAt),
      );
    const [state, raw = ''] = this.arrayResult(result);
    return {
      state: state as VerifyTransitionState,
      challenge: raw
        ? (JSON.parse(raw) as RegistrationOtpChallenge)
        : undefined,
    };
  }

  async recordFailedAttempt(
    prefix: string,
    registrationId: string,
    expectedDigest: string,
  ): Promise<VerifyTransitionResult> {
    const result = await this.redis
      .getClient()
      .eval(
        RECORD_FAILURE_SCRIPT,
        1,
        this.challengeKey(prefix, registrationId),
        expectedDigest,
      );
    const [state, attemptsRemaining = '0'] = this.arrayResult(result);
    return {
      state: state as VerifyTransitionState,
      attemptsRemaining: Number(attemptsRemaining),
    };
  }

  async consumeVerified(
    prefix: string,
    registrationId: string,
  ): Promise<FinalizeChallengeState> {
    const result = await this.redis
      .getClient()
      .eval(
        CONSUME_VERIFIED_SCRIPT,
        1,
        this.challengeKey(prefix, registrationId),
      );
    return String(result) as FinalizeChallengeState;
  }

  async releaseVerified(
    prefix: string,
    registrationId: string,
  ): Promise<FinalizeChallengeState> {
    const result = await this.redis
      .getClient()
      .eval(
        RELEASE_VERIFIED_SCRIPT,
        1,
        this.challengeKey(prefix, registrationId),
      );
    return String(result) as FinalizeChallengeState;
  }

  async discardChallenge(
    prefix: string,
    registrationId: string,
    subjectKey: string,
  ): Promise<void> {
    await this.redis
      .getClient()
      .eval(
        DISCARD_SCRIPT,
        3,
        this.challengeKey(prefix, registrationId),
        this.activeKey(prefix, subjectKey),
        this.cooldownKey(prefix, subjectKey),
        registrationId,
      );
  }

  private challengeKey(prefix: string, registrationId: string): string {
    return `${prefix}:challenge:${registrationId}`;
  }

  private activeKey(prefix: string, subject: string): string {
    return `${prefix}:active:${subject}`;
  }

  private cooldownKey(prefix: string, subject: string): string {
    return `${prefix}:cooldown:${subject}`;
  }

  private rateKey(prefix: string, type: string, identity: string): string {
    return `${prefix}:rate:${type}:${identity}`;
  }

  private arrayResult(value: unknown): string[] {
    if (!Array.isArray(value))
      throw new Error('Unexpected Redis script result');
    return value.map((item) => String(item));
  }
}
