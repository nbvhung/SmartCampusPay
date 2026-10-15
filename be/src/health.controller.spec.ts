import { DataSource } from 'typeorm';
import { HealthController } from './health.controller';
import { RedisService } from './modules/redis/redis.service';

describe('readiness', () => {
  const query = jest.fn();
  const ping = jest.fn();
  const controller = new HealthController(
    { query } as unknown as DataSource,
    { getClient: () => ({ ping }) } as unknown as RedisService,
  );
  it('requires both database and Redis', async () => {
    query.mockResolvedValue([{ '?column?': 1 }]);
    ping.mockResolvedValue('PONG');
    await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
    ping.mockRejectedValue(new Error('private connection details'));
    await expect(controller.ready()).rejects.toThrow('Dependencies unavailable');
    query.mockRejectedValue(new Error('private database details'));
    ping.mockResolvedValue('PONG');
    await expect(controller.ready()).rejects.toThrow('Dependencies unavailable');
  });
});
