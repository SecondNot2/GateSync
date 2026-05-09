import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

type CuaKhauSoQueueHandler = (organizationId: string, reason: string) => Promise<void>;
type PendingCuaKhauSoSync = {
  timer: NodeJS.Timeout;
};
type CuaKhauSoSyncJob = {
  organizationId: string;
  reason: string;
};

const defaultDebounceMs = 2_000;
const cuaKhauSoQueueName = 'gatesync-cua-khau-so-sync';

@Injectable()
export class IntegrationSyncQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(IntegrationSyncQueueService.name);
  private readonly pendingCuaKhauSoSyncs = new Map<string, PendingCuaKhauSoSync>();
  private readonly redisConnection: IORedis | undefined;
  private readonly cuaKhauSoQueue: Queue<CuaKhauSoSyncJob> | undefined;
  private cuaKhauSoWorker: Worker<CuaKhauSoSyncJob> | undefined;
  private cuaKhauSoHandler: CuaKhauSoQueueHandler | undefined;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const redisUrl = configService.get<string>('REDIS_URL');

    if (!redisUrl) {
      return;
    }

    this.redisConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null
    });
    this.redisConnection.on('error', (error) => {
      this.logger.warn(`Redis queue unavailable: ${error.message}`);
    });
    this.cuaKhauSoQueue = new Queue<CuaKhauSoSyncJob>(cuaKhauSoQueueName, {
      connection: this.redisConnection
    });
  }

  registerCuaKhauSoHandler(handler: CuaKhauSoQueueHandler) {
    this.cuaKhauSoHandler = handler;
    this.startCuaKhauSoWorker();

    return () => {
      if (this.cuaKhauSoHandler === handler) {
        this.cuaKhauSoHandler = undefined;
      }
    };
  }

  enqueueCuaKhauSoOrganization(organizationId: string, reason: string) {
    if (this.cuaKhauSoQueue) {
      void this.enqueueBullMqCuaKhauSoSync(organizationId, reason);
      return;
    }

    this.enqueueFallbackCuaKhauSoSync(organizationId, reason);
  }

  clearPendingCuaKhauSoSyncs() {
    for (const pending of this.pendingCuaKhauSoSyncs.values()) {
      clearTimeout(pending.timer);
    }

    this.pendingCuaKhauSoSyncs.clear();
  }

  async onModuleDestroy() {
    this.clearPendingCuaKhauSoSyncs();
    await this.cuaKhauSoWorker?.close();
    await this.cuaKhauSoQueue?.close();
    this.redisConnection?.disconnect();
  }

  private enqueueFallbackCuaKhauSoSync(organizationId: string, reason: string) {
    const existing = this.pendingCuaKhauSoSyncs.get(organizationId);

    if (existing) {
      clearTimeout(existing.timer);
    }

    const timer = setTimeout(() => {
      this.pendingCuaKhauSoSyncs.delete(organizationId);
      void this.runCuaKhauSoSync(organizationId, reason);
    }, defaultDebounceMs);

    this.pendingCuaKhauSoSyncs.set(organizationId, {
      timer
    });
  }

  private async enqueueBullMqCuaKhauSoSync(organizationId: string, reason: string) {
    if (!this.cuaKhauSoQueue) {
      this.enqueueFallbackCuaKhauSoSync(organizationId, reason);
      return;
    }

    try {
      await this.cuaKhauSoQueue.add(
        'sync-organization',
        {
          organizationId,
          reason
        },
        {
          jobId: `cua-khau-so:${organizationId}`,
          delay: defaultDebounceMs,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 30_000
          },
          removeOnComplete: 1000,
          removeOnFail: 1000
        }
      );
    } catch (error) {
      this.logger.warn(
        error instanceof Error
          ? `Không thể enqueue BullMQ Cửa khẩu số, dùng fallback: ${error.message}`
          : 'Không thể enqueue BullMQ Cửa khẩu số, dùng fallback.'
      );
      this.enqueueFallbackCuaKhauSoSync(organizationId, reason);
    }
  }

  private startCuaKhauSoWorker() {
    if (!this.redisConnection || this.cuaKhauSoWorker) {
      return;
    }

    this.cuaKhauSoWorker = new Worker<CuaKhauSoSyncJob>(
      cuaKhauSoQueueName,
      async (job) => {
        await this.runCuaKhauSoSync(job.data.organizationId, job.data.reason);
      },
      {
        connection: this.redisConnection,
        concurrency: 1
      }
    );
    this.cuaKhauSoWorker.on('failed', (job, error) => {
      this.logger.error(
        `BullMQ Cửa khẩu số job ${job?.id ?? 'unknown'} failed: ${error.message}`,
        error.stack
      );
    });
  }

  private async runCuaKhauSoSync(organizationId: string, reason: string) {
    if (!this.cuaKhauSoHandler) {
      this.logger.warn(`Bỏ qua đồng bộ Cửa khẩu số cho tổ chức ${organizationId}: chưa có worker.`);
      return;
    }

    try {
      await this.cuaKhauSoHandler(organizationId, reason);
    } catch (error) {
      this.logger.error(
        error instanceof Error
          ? error.message
          : 'Không thể chạy đồng bộ Cửa khẩu số theo hàng đợi.',
        error instanceof Error ? error.stack : undefined
      );
    }
  }
}
