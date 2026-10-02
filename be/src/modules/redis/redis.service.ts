import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.client = new Redis({
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: this.config.get('REDIS_PORT', 6379),
      retryStrategy: (times) => Math.min(times * 50, 2000),
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: 2000,
    });

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) =>
      this.logger.error(`Redis error: ${err.message}`),
    );
  }

  async onModuleDestroy() {
    if (this.client.status === 'ready') await this.client.quit();
    else this.client.disconnect();
  }

  getClient(): Redis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSec?: number): Promise<void> {
    if (ttlSec) {
      await this.client.set(key, value, 'EX', ttlSec);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, ttlSec: number): Promise<void> {
    await this.client.expire(key, ttlSec);
  }

  async acquireLock(lockKey: string, ttlSec = 5): Promise<string | null> {
    if (this.client.status !== 'ready') {
      this.logger.warn(
        `Redis not ready (${this.client.status}), skipping lock`,
      );
      return `fallback:${randomUUID()}`;
    }
    try {
      const token = randomUUID();
      const result = await this.client.set(
        `lock:${lockKey}`,
        token,
        'PX',
        ttlSec * 1000,
        'NX',
      );
      return result === 'OK' ? token : null;
    } catch (err: unknown) {
      this.logger.warn(
        `Redis lock failed, proceeding without lock: ${err instanceof Error ? err.message : String(err)}`,
      );
      return `fallback:${randomUUID()}`;
    }
  }

  async releaseLock(lockKey: string, token: string): Promise<void> {
    if (token.startsWith('fallback:')) return;
    try {
      await this.client.eval(
        `if redis.call('get', KEYS[1]) == ARGV[1] then
           return redis.call('del', KEYS[1])
         end
         return 0`,
        1,
        `lock:${lockKey}`,
        token,
      );
    } catch (err: unknown) {
      this.logger.warn(
        `Redis lock release failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
