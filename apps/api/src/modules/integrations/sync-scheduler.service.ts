/**
 * SyncScheduler
 *
 * Periodically scans `IntegrationAccount` rows and creates `IntegrationSyncRun`
 * (`status = QUEUED`) jobs for accounts whose cron + timezone make them due.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 13.2
 *
 * Cross-ref: design.md "Sync Scheduler" section.
 *
 * Behaviour summary:
 *   1. `@Cron(EVERY_30_SECONDS)` tick wrapper guards re-entrancy.
 *   2. Per-account due evaluation uses `cron-parser` with IANA timezone
 *      and `lastFiredAt` to avoid duplicate fires.
 *   3. Single-fire under concurrency is enforced via Postgres
 *      `SELECT ... FOR UPDATE SKIP LOCKED` on `integration_accounts`.
 *   4. Conflict / validation / forbidden / manual-only outcomes are
 *      surfaced as `IntegrationSyncLog` rows (when a run exists) plus
 *      structured Nest logger output (when no run exists yet).
 *   5. Queue-depth backpressure with hysteresis stops scheduling once
 *      aggregate queue depth >= `queueHighWatermark`, resumes at
 *      <= `queueLowWatermark`.
 *   6. Infra failures (DB or queue.add) retry up to 3× with delay >= 5s
 *      and emit `INTEGRATION_FAILED` after the third failure.
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IntegrationProvider, IntegrationStatus, IntegrationSyncRunStatus } from '@prisma/client';
import type { IntegrationAccount, IntegrationSyncRun, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { parseExpression } from 'cron-parser';
import IORedis from 'ioredis';
import { defaultSensitiveScrubber } from '@gatesync/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Discriminated reasons for skipping a candidate during a tick.
 * The {@link TickReport} aggregates these per tick for observability.
 */
export type TickSkipReason =
  | 'NOT_DUE'
  | 'MANUAL_ONLY'
  | 'VALIDATION_ERROR'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'LOCK_NOT_ACQUIRED'
  | 'BACKPRESSURE'
  | 'INFRA_ERROR';

export interface TickReport {
  startedAt: Date;
  finishedAt: Date;
  scanned: number;
  enqueued: number;
  skipped: Record<TickSkipReason, number>;
  backpressureActive: boolean;
}

export interface SyncSchedulerActor {
  kind: 'user' | 'system';
  id?: string;
}

export interface SyncSchedulerPort {
  tick(now: Date): Promise<TickReport>;
  triggerManual(
    integrationAccountId: string,
    actor: SyncSchedulerActor
  ): Promise<IntegrationSyncRun>;
}

type ScheduleOutcome =
  | { kind: 'enqueued'; run: IntegrationSyncRun }
  | { kind: 'skipped'; reason: TickSkipReason };

type DueResult = 'invalid' | 'not-due' | 'due';

const DEFAULT_QUEUE_HIGH_WATERMARK = 200;
const DEFAULT_QUEUE_LOW_WATERMARK = 100;
const INFRA_RETRY_LIMIT = 3;
const INFRA_RETRY_DELAY_MS = 5_000;

const ACTIVE_RUN_STATUSES: IntegrationSyncRunStatus[] = [
  IntegrationSyncRunStatus.QUEUED,
  IntegrationSyncRunStatus.RUNNING,
  IntegrationSyncRunStatus.RETRYING
];

const PROVIDERS: readonly IntegrationProvider[] = Object.values(IntegrationProvider);

const initialSkipped = (): Record<TickSkipReason, number> => ({
  NOT_DUE: 0,
  MANUAL_ONLY: 0,
  VALIDATION_ERROR: 0,
  FORBIDDEN: 0,
  CONFLICT: 0,
  LOCK_NOT_ACQUIRED: 0,
  BACKPRESSURE: 0,
  INFRA_ERROR: 0
});

@Injectable()
export class SyncSchedulerService implements SyncSchedulerPort, OnModuleDestroy {
  private readonly logger = new Logger(SyncSchedulerService.name);
  private readonly scrubber = defaultSensitiveScrubber;
  private readonly redisConnection: IORedis | undefined;
  private readonly queues = new Map<IntegrationProvider, Queue>();
  private readonly queueHighWatermark: number;
  private readonly queueLowWatermark: number;
  private backpressureActive = false;
  private tickInFlight = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly configService: ConfigService
  ) {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (redisUrl) {
      this.redisConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
      this.redisConnection.on('error', (err: Error) => {
        this.logger.warn(`Hàng đợi đồng bộ không sẵn sàng: ${err.message}`);
      });
    }

    this.queueHighWatermark = this.parsePositiveInt(
      this.configService.get<string>('SYNC_QUEUE_HIGH_WATERMARK'),
      DEFAULT_QUEUE_HIGH_WATERMARK
    );
    this.queueLowWatermark = this.parseNonNegativeInt(
      this.configService.get<string>('SYNC_QUEUE_LOW_WATERMARK'),
      DEFAULT_QUEUE_LOW_WATERMARK
    );
  }

  async onModuleDestroy(): Promise<void> {
    for (const queue of this.queues.values()) {
      try {
        await queue.close();
      } catch (err) {
        this.logger.warn(this.scrub(err));
      }
    }
    this.queues.clear();
    this.redisConnection?.disconnect();
  }

  /**
   * Cron tick wrapper. Runs every 30 seconds (Requirement 1.1) and is
   * re-entrancy guarded so that a slow tick never overlaps with the next.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async runTick(): Promise<void> {
    if (this.tickInFlight) {
      this.logger.debug('Bỏ qua tick: lần thực thi trước chưa hoàn tất.');
      return;
    }
    this.tickInFlight = true;
    try {
      await this.tick(new Date());
    } catch (err) {
      this.logger.error(this.scrub(err));
    } finally {
      this.tickInFlight = false;
    }
  }

  async tick(now: Date): Promise<TickReport> {
    const startedAt = new Date(now.getTime());
    const skipped = initialSkipped();
    let scanned = 0;
    let enqueued = 0;

    // Backpressure with hysteresis (Property 10 / Requirement 13.2).
    const aggregateDepth = await this.estimateAggregateQueueDepth();
    if (this.backpressureActive) {
      if (aggregateDepth <= this.queueLowWatermark) {
        this.backpressureActive = false;
        this.logger.log(
          `Hết tải hàng đợi (depth=${aggregateDepth} ≤ low=${this.queueLowWatermark}); tiếp tục lập lịch.`
        );
      }
    } else if (aggregateDepth >= this.queueHighWatermark) {
      this.backpressureActive = true;
      this.logger.warn(
        `Quá tải hàng đợi (depth=${aggregateDepth} ≥ high=${this.queueHighWatermark}); tạm dừng lập lịch.`
      );
    }
    if (this.backpressureActive) {
      return {
        startedAt,
        finishedAt: new Date(),
        scanned: 0,
        enqueued: 0,
        skipped: { ...skipped, BACKPRESSURE: 1 },
        backpressureActive: true
      };
    }

    let candidates: IntegrationAccount[];
    try {
      candidates = await this.prisma.integrationAccount.findMany({
        where: {
          status: IntegrationStatus.ACTIVE,
          deletedAt: null,
          manualOnly: false,
          cron: { not: null },
          timezone: { not: null }
        }
      });
    } catch (err) {
      this.logger.error(`Không thể tải danh sách integration accounts: ${this.scrub(err)}`);
      skipped.INFRA_ERROR += 1;
      return {
        startedAt,
        finishedAt: new Date(),
        scanned: 0,
        enqueued: 0,
        skipped,
        backpressureActive: false
      };
    }

    for (const account of candidates) {
      scanned += 1;

      const due = this.evaluateDue(account, now);
      if (due === 'invalid') {
        // Requirement 1.5
        skipped.VALIDATION_ERROR += 1;
        this.logger.warn(
          `[VALIDATION_ERROR] integrationAccountId=${account.id} cron/timezone không hợp lệ.`
        );
        continue;
      }
      if (due === 'not-due') {
        skipped.NOT_DUE += 1;
        continue;
      }

      try {
        const outcome = await this.scheduleRunWithInfraRetry(account, now, undefined);
        if (outcome.kind === 'enqueued') {
          enqueued += 1;
        } else {
          skipped[outcome.reason] += 1;
        }
      } catch {
        // Already logged inside scheduleRunWithInfraRetry.
        skipped.INFRA_ERROR += 1;
      }
    }

    return {
      startedAt,
      finishedAt: new Date(),
      scanned,
      enqueued,
      skipped,
      backpressureActive: false
    };
  }

  /**
   * Manually trigger a `Sync_Run` for a specific account, bypassing schedule
   * checks but enforcing the same locking, conflict, validation and tenant
   * checks as the scheduled path.
   */
  async triggerManual(
    integrationAccountId: string,
    actor: SyncSchedulerActor
  ): Promise<IntegrationSyncRun> {
    const account = await this.prisma.integrationAccount.findFirst({
      where: { id: integrationAccountId, deletedAt: null }
    });
    if (!account) {
      throw new Error(`NOT_FOUND: integrationAccount ${integrationAccountId}`);
    }
    if (account.status !== IntegrationStatus.ACTIVE) {
      throw new Error(
        `VALIDATION_ERROR: integrationAccount ${integrationAccountId} không ở trạng thái ACTIVE.`
      );
    }

    const outcome = await this.scheduleRunWithInfraRetry(account, new Date(), { actor });
    if (outcome.kind === 'enqueued') {
      return outcome.run;
    }
    throw new Error(outcome.reason);
  }

  // -------------------------------------------------------------- internals

  private async scheduleRunWithInfraRetry(
    account: IntegrationAccount,
    now: Date,
    manual: { actor: SyncSchedulerActor } | undefined
  ): Promise<ScheduleOutcome> {
    let lastError: unknown;
    for (let attempt = 0; attempt < INFRA_RETRY_LIMIT; attempt += 1) {
      try {
        return await this.scheduleRunOnce(account, now, manual);
      } catch (err) {
        lastError = err;
        const remaining = INFRA_RETRY_LIMIT - attempt - 1;
        this.logger.warn(
          `Lỗi hạ tầng khi tạo Sync_Run cho integrationAccountId=${account.id} ` +
            `(còn ${remaining} lần thử): ${this.scrub(err)}`
        );
        if (remaining > 0) {
          await this.sleep(INFRA_RETRY_DELAY_MS);
        }
      }
    }
    // Requirement 1.7 — log INTEGRATION_FAILED after 3 attempts.
    this.logger.error(
      `[INTEGRATION_FAILED] integrationAccountId=${account.id} không thể tạo Sync_Run sau ` +
        `${INFRA_RETRY_LIMIT} lần thử: ${this.scrub(lastError)}`
    );
    throw lastError instanceof Error ? lastError : new Error('INTEGRATION_FAILED');
  }

  private async scheduleRunOnce(
    account: IntegrationAccount,
    now: Date,
    manual: { actor: SyncSchedulerActor } | undefined
  ): Promise<ScheduleOutcome> {
    return this.prisma.$transaction(async (tx) => {
      // Single-fire lock (Requirement 1.3) — concurrent schedulers SKIP LOCKED.
      const locked = await tx.$queryRaw<
        Array<{ id: string; organization_id: string; manual_only: boolean }>
      >`
        SELECT id, organization_id, manual_only
        FROM integration_accounts
        WHERE id = ${account.id}::uuid
          AND deleted_at IS NULL
        FOR UPDATE SKIP LOCKED
      `;
      const lockedRow = locked[0];
      if (!lockedRow) {
        return { kind: 'skipped', reason: 'LOCK_NOT_ACQUIRED' };
      }

      // Tenant guard (Requirement 1.6).
      if (lockedRow.organization_id !== account.organizationId) {
        await this.recordRunlessLog(
          tx,
          account.organizationId,
          'FORBIDDEN',
          `Tenant context mismatch cho integrationAccountId=${account.id}.`
        );
        return { kind: 'skipped', reason: 'FORBIDDEN' };
      }

      // Manual-only guard (Requirement 1.4) — re-checked under lock.
      if (lockedRow.manual_only && !manual) {
        return { kind: 'skipped', reason: 'MANUAL_ONLY' };
      }

      // Conflict guard (Requirement 1.3).
      const existing = await tx.integrationSyncRun.findFirst({
        where: {
          integrationAccountId: account.id,
          status: { in: ACTIVE_RUN_STATUSES }
        },
        select: { id: true, organizationId: true }
      });
      if (existing) {
        await this.writeIntegrationSyncLog(tx, {
          organizationId: existing.organizationId,
          syncRunId: existing.id,
          level: 'WARN',
          code: 'CONFLICT',
          message: `Bỏ qua: integrationAccountId=${account.id} đã có Sync_Run đang chạy.`
        });
        return { kind: 'skipped', reason: 'CONFLICT' };
      }

      const attemptGroupId = randomUUID();
      const metadata: Prisma.InputJsonValue | undefined = manual
        ? { actor: manual.actor as unknown as Prisma.InputJsonObject }
        : undefined;
      const run = await tx.integrationSyncRun.create({
        data: {
          organizationId: account.organizationId,
          integrationAccountId: account.id,
          status: IntegrationSyncRunStatus.QUEUED,
          mode: manual ? 'MANUAL' : 'AUTO',
          attemptIndex: 0,
          attemptGroupId,
          ...(metadata !== undefined ? { metadata } : {})
        }
      });

      // Update lastFiredAt (Requirement 1.2 — schedule advances per fire).
      await tx.integrationAccount.update({
        where: { id: account.id },
        data: { lastFiredAt: now }
      });

      // Enqueue BullMQ job (Requirement 1.2).
      await this.enqueueBullJob(account.provider, run, attemptGroupId);

      return { kind: 'enqueued', run };
    });
  }

  private async enqueueBullJob(
    provider: IntegrationProvider,
    run: IntegrationSyncRun,
    attemptGroupId: string
  ): Promise<void> {
    const queue = this.getOrCreateQueue(provider);
    if (!queue) {
      // No Redis configured — worker module will pick up the QUEUED row via
      // a polling fallback. We still log so operators can see the gap.
      this.logger.warn(
        `Redis chưa cấu hình; Sync_Run ${run.id} (provider=${provider}) sẽ chờ fallback worker.`
      );
      return;
    }

    await queue.add(
      'sync-run',
      {
        syncRunId: run.id,
        integrationAccountId: run.integrationAccountId,
        organizationId: run.organizationId,
        attemptGroupId,
        attemptIndex: run.attemptIndex
      },
      {
        jobId: `sync-run:${run.id}`,
        removeOnComplete: 1000,
        removeOnFail: 1000
      }
    );
  }

  private getOrCreateQueue(provider: IntegrationProvider): Queue | undefined {
    if (!this.redisConnection) {
      return undefined;
    }
    const cached = this.queues.get(provider);
    if (cached) {
      return cached;
    }
    const queue = new Queue(this.queueNameFor(provider), {
      connection: this.redisConnection
    });
    this.queues.set(provider, queue);
    return queue;
  }

  private queueNameFor(provider: IntegrationProvider): string {
    return `sync-run:${provider.toLowerCase()}`;
  }

  private async estimateAggregateQueueDepth(): Promise<number> {
    if (!this.redisConnection) {
      return 0;
    }
    let total = 0;
    for (const provider of PROVIDERS) {
      const queue = this.getOrCreateQueue(provider);
      if (!queue) {
        continue;
      }
      try {
        const counts = await queue.getJobCounts('waiting', 'delayed', 'active');
        total += (counts.waiting ?? 0) + (counts.delayed ?? 0) + (counts.active ?? 0);
      } catch (err) {
        // A single failing queue should not break the tick; just log and skip.
        this.logger.debug(`Không lấy được job counts cho ${provider}: ${this.scrub(err)}`);
      }
    }
    return total;
  }

  private evaluateDue(account: IntegrationAccount, now: Date): DueResult {
    if (!account.cron || !account.timezone) {
      return 'invalid';
    }
    try {
      const iterator = parseExpression(account.cron, {
        currentDate: now,
        tz: account.timezone
      });
      const previous = iterator.prev().toDate();
      // First-ever fire: no lastFiredAt → fire on the first matching minute we see.
      if (!account.lastFiredAt) {
        return previous.getTime() <= now.getTime() ? 'due' : 'not-due';
      }
      return previous.getTime() > account.lastFiredAt.getTime() ? 'due' : 'not-due';
    } catch {
      return 'invalid';
    }
  }

  private async writeIntegrationSyncLog(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      syncRunId: string;
      level: 'INFO' | 'WARN' | 'ERROR';
      code: string;
      message: string;
      sourceReference?: string;
    }
  ): Promise<void> {
    const sanitizedMessage = this.scrub(input.message);
    try {
      await tx.integrationSyncLog.create({
        data: {
          organizationId: input.organizationId,
          syncRunId: input.syncRunId,
          level: input.level,
          code: input.code,
          message: sanitizedMessage,
          ...(input.sourceReference !== undefined ? { sourceReference: input.sourceReference } : {})
        }
      });
    } catch (err) {
      this.logger.warn(`Không thể ghi IntegrationSyncLog (${input.code}): ${this.scrub(err)}`);
    }
  }

  /**
   * Logs a scheduler-level event that has no associated sync run yet
   * (e.g. tenant mismatch, validation errors). The IntegrationSyncLog table
   * requires a syncRunId, so we route these to the Nest logger with a
   * structured prefix so operators can still find them.
   */
  private async recordRunlessLog(
    _tx: Prisma.TransactionClient,
    organizationId: string,
    code: string,
    message: string
  ): Promise<void> {
    this.logger.warn(`[${code}] organizationId=${organizationId} ${this.scrub(message)}`);
  }

  private scrub(value: unknown): string {
    const message =
      value instanceof Error
        ? value.message
        : typeof value === 'string'
          ? value
          : JSON.stringify(value);
    return this.scrubber.scrub(message);
  }

  private parsePositiveInt(raw: string | undefined, fallback: number): number {
    if (!raw) {
      return fallback;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private parseNonNegativeInt(raw: string | undefined, fallback: number): number {
    if (!raw) {
      return fallback;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
