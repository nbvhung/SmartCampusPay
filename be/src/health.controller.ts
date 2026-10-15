import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { Public } from './common/decorators/public.decorator';
import { RedisService } from './modules/redis/redis.service';

@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly db: DataSource, private readonly redis: RedisService) {}

  @Get('live')
  live() { return { status: 'ok' }; }

  @Get('ready')
  async ready() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all([this.db.query('SELECT 1'), this.redis.getClient().ping()]),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 2500); }),
      ]);
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Dependencies unavailable');
    } finally {
      clearTimeout(timer);
    }
  }
}
