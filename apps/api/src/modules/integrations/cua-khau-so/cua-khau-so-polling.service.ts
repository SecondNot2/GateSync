import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationSyncQueueService } from '../integration-sync-queue.service';
import { CuaKhauSoService } from './cua-khau-so.service';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

const circuitFailureThreshold = 3;
const circuitResetMs = 5 * 60_000;

@Injectable()
export class CuaKhauSoPollingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CuaKhauSoPollingService.name);
  private timer?: NodeJS.Timeout;
  private isRunning = false;
  private unregisterOnDemandHandler?: () => void;

  private circuitState: CircuitState = 'CLOSED';
  private globalConsecutiveFailures = 0;
  private circuitOpenedAt: number | undefined;

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

    if (this.circuitState === 'OPEN') {
      const elapsed = this.circuitOpenedAt ? Date.now() - this.circuitOpenedAt : Infinity;

      if (elapsed < circuitResetMs) {
        return;
      }

      this.circuitState = 'HALF_OPEN';
      this.logger.warn('CKS circuit breaker entering HALF_OPEN — probing once.');
    }

    this.isRunning = true;

    try {
      const result = await this.cuaKhauSoService.pollActiveAccounts();
      const allFailed =
        result.accountsProcessed > 0 &&
        result.results.every((r) => r.status === 'FAILED' || r.status === 'SKIPPED');

      if (allFailed) {
        this.onPollFailure();
      } else {
        this.onPollSuccess();
      }

      this.logger.log(`Cửa khẩu số polling processed ${result.accountsProcessed} accounts.`);
    } catch (error) {
      this.onPollFailure();
      this.logger.error(
        error instanceof Error ? error.message : 'Cửa khẩu số polling failed.',
        error instanceof Error ? error.stack : undefined
      );
    } finally {
      this.isRunning = false;
    }
  }

  private onPollSuccess() {
    if (this.circuitState !== 'CLOSED') {
      this.logger.log('CKS circuit breaker CLOSED — sync recovered.');
    }

    this.globalConsecutiveFailures = 0;
    this.circuitState = 'CLOSED';
  }

  private onPollFailure() {
    this.globalConsecutiveFailures += 1;

    if (this.globalConsecutiveFailures >= circuitFailureThreshold) {
      this.circuitState = 'OPEN';
      this.circuitOpenedAt = Date.now();
      this.logger.warn(
        `CKS circuit breaker OPEN after ${this.globalConsecutiveFailures} consecutive failures. ` +
          `Will retry in ${Math.round(circuitResetMs / 60_000)} minutes.`
      );
    }
  }
}
