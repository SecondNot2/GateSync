import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationSyncQueueService } from '../integration-sync-queue.service';
import { CuaKhauSoService } from './cua-khau-so.service';

@Injectable()
export class CuaKhauSoPollingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CuaKhauSoPollingService.name);
  private timer?: NodeJS.Timeout;
  private isRunning = false;
  private unregisterOnDemandHandler?: () => void;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(IntegrationSyncQueueService) private readonly syncQueue: IntegrationSyncQueueService,
    @Inject(CuaKhauSoService) private readonly cuaKhauSoService: CuaKhauSoService
  ) {}

  onModuleInit() {
    this.unregisterOnDemandHandler = this.syncQueue.registerCuaKhauSoHandler(
      async (organizationId, reason) => {
        await this.cuaKhauSoService.syncOrganizationFromQueue(organizationId, reason);
      }
    );

    const enabled = this.configService.get<string>('CUA_KHAU_SO_POLLING_ENABLED') === 'true';

    if (!enabled) {
      return;
    }

    const intervalMs = Math.max(
      90_000,
      this.configService.get<number>('CUA_KHAU_SO_POLLING_INTERVAL_MS') ?? 90_000
    );

    this.timer = setInterval(() => {
      void this.runOnce();
    }, intervalMs);

    void this.runOnce();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }

    this.unregisterOnDemandHandler?.();
    this.syncQueue.clearPendingCuaKhauSoSyncs();
  }

  private async runOnce() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      const result = await this.cuaKhauSoService.pollActiveAccounts();
      this.logger.log(`Cửa khẩu số polling processed ${result.accountsProcessed} accounts.`);
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.message : 'Cửa khẩu số polling failed.',
        error instanceof Error ? error.stack : undefined
      );
    } finally {
      this.isRunning = false;
    }
  }
}
