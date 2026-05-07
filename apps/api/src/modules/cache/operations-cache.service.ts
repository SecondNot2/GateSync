import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

const dashboardStatsTtlMs = 2 * 60_000;
const tripListTtlMs = 30_000;
const cksDeclarationsTtlMs = 90_000;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

@Injectable()
export class OperationsCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(OperationsCacheService.name);
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly redis: IORedis | undefined;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const redisUrl = configService.get<string>('REDIS_URL');

    if (!redisUrl) {
      return;
    }

    this.redis = new IORedis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1
    });
    this.redis.on('error', (error) => {
      this.logger.warn(`Redis cache unavailable: ${error.message}`);
    });
  }

  async onModuleDestroy() {
    this.redis?.disconnect();
  }

  async getOrSet<T>(key: string, ttlMs: number, factory: () => Promise<T>): Promise<T> {
    const redisValue = await this.getFromRedis<T>(key);

    if (redisValue !== undefined) {
      return redisValue;
    }

    const cached = this.entries.get(key);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      return cached.value as T;
    }

    const value = await factory();
    this.entries.set(key, {
      expiresAt: now + ttlMs,
      value
    });
    await this.setRedisValue(key, ttlMs, value);

    return value;
  }

  makeDashboardStatsKey(organizationId: string) {
    return `org:${organizationId}:dashboard:stats`;
  }

  makeTripListKey(organizationId: string, filterHash: string) {
    return `org:${organizationId}:trips:list:${filterHash}`;
  }

  makeCuaKhauSoDeclarationsKey(organizationId: string, gateId: string) {
    return `org:${organizationId}:cks:declarations:${gateId}`;
  }

  dashboardStatsTtlMs() {
    return dashboardStatsTtlMs;
  }

  tripListTtlMs() {
    return tripListTtlMs;
  }

  cksDeclarationsTtlMs() {
    return cksDeclarationsTtlMs;
  }

  async invalidateOrganization(organizationId: string) {
    const prefix = `org:${organizationId}:`;

    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
      }
    }

    await this.deleteRedisKeysByPrefix(prefix);
  }

  async invalidateTripReadModels(organizationId: string) {
    const dashboardKey = this.makeDashboardStatsKey(organizationId);
    const tripListPrefix = `org:${organizationId}:trips:list:`;

    this.entries.delete(dashboardKey);

    for (const key of this.entries.keys()) {
      if (key.startsWith(tripListPrefix)) {
        this.entries.delete(key);
      }
    }

    await this.deleteRedisKeys([dashboardKey]);
    await this.deleteRedisKeysByPrefix(tripListPrefix);
  }

  async invalidateCuaKhauSoReadModels(organizationId: string) {
    const cksPrefix = `org:${organizationId}:cks:declarations:`;
    const tripListPrefix = `org:${organizationId}:trips:list:`;

    for (const key of this.entries.keys()) {
      if (key.startsWith(cksPrefix) || key.startsWith(tripListPrefix)) {
        this.entries.delete(key);
      }
    }

    await this.deleteRedisKeysByPrefix(cksPrefix);
    await this.deleteRedisKeysByPrefix(tripListPrefix);
  }

  private async getFromRedis<T>(key: string): Promise<T | undefined> {
    if (!this.redis) {
      return undefined;
    }

    try {
      const value = await this.redis.get(key);

      return value ? (JSON.parse(value) as T) : undefined;
    } catch {
      return undefined;
    }
  }

  private async setRedisValue(key: string, ttlMs: number, value: unknown) {
    if (!this.redis) {
      return;
    }

    try {
      await this.redis.set(key, JSON.stringify(value), 'PX', ttlMs);
    } catch {
      return;
    }
  }

  private async deleteRedisKeys(keys: string[]) {
    if (!this.redis || keys.length === 0) {
      return;
    }

    try {
      await this.redis.del(...keys);
    } catch {
      return;
    }
  }

  private async deleteRedisKeysByPrefix(prefix: string) {
    if (!this.redis) {
      return;
    }

    try {
      const keys: string[] = [];
      let cursor = '0';

      do {
        const [nextCursor, batch] = await this.redis.scan(
          cursor,
          'MATCH',
          `${prefix}*`,
          'COUNT',
          100
        );
        cursor = nextCursor;
        keys.push(...batch);
      } while (cursor !== '0');

      await this.deleteRedisKeys(keys);
    } catch {
      return;
    }
  }
}
