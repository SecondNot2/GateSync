/**
 * SyncWorker — BullMQ processor for the AUTO SYNC pipeline.
 *
 * Consumes jobs from `sync-run:{provider}` queues (task 17.2) and executes a
 * single `IntegrationSyncRun` end-to-end:
 *
 *   1. Load the `IntegrationSyncRun` and its `IntegrationAccount`.
 *   2. Resolve the right `ProviderAdapter` from {@link ProviderAdapterRegistry}.
 *   3. Apply per-provider rate limit via BullMQ `limiter` and per-record
 *      pacing from `account.maxRequestsPerSecond`.
 *   4. Apply per-run timeout = `account.maxRunDurationSeconds` (default 120s).
 *   5. Iterate `adapter.fetch(account, cursor)` and call `adapter.map` for
 *      each payload, batching produced `TripEventCommand`s through the
 *      {@link TripEventApplyPort} (task 6.1) inside a transaction.
 *   6. Classify errors and decide retry via `shouldRetry` / `computeRetryDelayMs`.
 *   7. Persist counters (`recordsFetched`, `eventsCreated`, `eventsSkipped`,
 *      `recordsRejected`), `errorCode`, `httpStatus`, `nextRetryAt` on the run.
 *   8. Log every meaningful step to `IntegrationSyncLog` through
 *      {@link SensitiveScrubber}.
 *
 * Validates: Requirements 2.1, 2.5, 2.7, 3.1, 3.2, 3.3, 3.4, 3.6,
 *            13.1, 13.3, 13.4
 * Cross-ref: design.md "Sync Worker", "SyncRunOutcome", "Sensitive field policy".
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  computeRetryDelayMs,
  defaultSensitiveScrubber,
  shouldRetry,
  SYNC_RETRY_POLICY
} from '@gatesync/shared';
import type { SensitiveScrubber, SyncErrorCode } from '@gatesync/shared';
import type {
  IntegrationAccount,
  IntegrationProvider,
  IntegrationSyncRun,
  Prisma
} from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import type { Job, WorkerOptions } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AdapterContext,
  MapResult,
  RejectedSample,
  SyncCounters,
  SyncCursor,
  SyncRunOutcome,
  TripEventCommand
} from './adapters/provider-adapter';
import { PROVIDER_ADAPTERS, type ProviderAdapterRegistry } from './provider-adapter-registry';
import {
  classifySyncError,
  SyncRunTimeoutError,
  type ClassifiedSyncError
} from './sync-error-classifier';
import {
  syncJobIdForRun,
  syncQueueNameForProvider,
  SYNC_WORKER_PROVIDERS,
  type SyncRunJobData
} from './sync-queue-names';
import { SYNC_RUN_FAILED_EVENT, type SyncRunFailedEvent } from './sync-run-failed.event';
import {
  TRIP_EVENT_APPLY_PORT,
  type TripEventApplyContext,
  type TripEventApplyPort,
  type TripEventApplyResult
} from './trip-event-apply.port';

/** Default per-run timeout when `IntegrationAccount.maxRunDurationSeconds` is unset. */
const DEFAULT_RUN_TIMEOUT_SECONDS = 120;

/** Number of `TripEventCommand`s flushed in a single `applyCommand` batch. */
const DEFAULT_BATCH_SIZE = 50;

/** Default BullMQ worker concurrency per provider queue. */
const DEFAULT_WORKER_CONCURRENCY = 2;

/** Default BullMQ rate-limit window. */
const DEFAULT_RATE_LIMIT_WINDOW_MS = 1000;

/**
 * The worker depends on the design's `SyncWorkerPort`. Defining the port
 * here (rather than re-importing from design.md) keeps the module
 * self-contained and lets tests mock the entry point cleanly.
 */
export interface SyncWorkerPort {
  /** Execute one attempt of the named sync run. */
  execute(syncRunId: string, attemptIndex: number): Promise<SyncRunOutcome>;
}

/** Loaded run + account tuple used internally. */
type LoadedRun = {
  run: IntegrationSyncRun;
  account: IntegrationAccount;
};

@Injectable()
export class SyncWorkerService implements SyncWorkerPort, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncWorkerService.name);
  private readonly scrubber: SensitiveScrubber = defaultSensitiveScrubber;

  /** Lazy-initialised Redis connection. Undefined when `REDIS_URL` is missing. */
  private redisConnection?: IORedis;
  /** Per-provider BullMQ queues so the worker can re-enqueue retries. */
  private readonly queues = new Map<IntegrationProvider, Queue<SyncRunJobData>>();
  /** Per-provider BullMQ workers consuming `sync-run:{provider}`. */
  private readonly workers = new Map<IntegrationProvider, Worker<SyncRunJobData>>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Optional()
    @Inject(PROVIDER_ADAPTERS)
    private readonly registry?: ProviderAdapterRegistry,
    @Optional()
    @Inject(TRIP_EVENT_APPLY_PORT)
    private readonly tripEventApply?: TripEventApplyPort,
    @Optional()
    @Inject(EventEmitter2)
    private readonly eventEmitter?: EventEmitter2
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn(
        'SyncWorker: REDIS_URL not configured — BullMQ workers disabled, execute() can still be called directly.'
      );
      return;
    }

    this.redisConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.redisConnection.on('error', (error) => {
      this.logger.warn(`SyncWorker Redis unavailable: ${error.message}`);
    });

    for (const provider of SYNC_WORKER_PROVIDERS) {
      this.startProviderWorker(provider);
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const worker of this.workers.values()) {
      await worker.close();
    }
    this.workers.clear();
    for (const queue of this.queues.values()) {
      await queue.close();
    }
    this.queues.clear();
    this.redisConnection?.disconnect();
  }

  // ---------------------------------------------------------------------------
  // Public entry point
  // ---------------------------------------------------------------------------

  /**
   * Execute a single attempt of an `IntegrationSyncRun`. Returns the outcome
   * so callers (BullMQ worker or tests) can decide what to do next. All
   * persistence side-effects (run status, counters, logs, retry scheduling)
   * have already been written by the time this method resolves.
   */
  async execute(syncRunId: string, attemptIndex: number): Promise<SyncRunOutcome> {
    const loaded = await this.loadRun(syncRunId);
    if (!loaded) {
      this.logger.warn(`SyncWorker: run ${syncRunId} not found`);
      return { status: 'FAILED', errorCode: 'INTERNAL_ERROR' };
    }

    const { run, account } = loaded;
    const adapter = this.registry?.get(account.provider);

    if (!adapter) {
      const message = `No ProviderAdapter registered for provider "${account.provider}"`;
      await this.markRunFailed(run, { errorCode: 'INTERNAL_ERROR', message }, undefined, account);
      return { status: 'FAILED', errorCode: 'INTERNAL_ERROR' };
    }

    await this.markRunRunning(run, attemptIndex);
    await this.appendLog(run, 'INFO', 'RUN_STARTED', `Sync run started (attempt ${attemptIndex})`);

    const startedAtMs = run.startedAt.getTime();
    const timeoutSeconds = account.maxRunDurationSeconds ?? DEFAULT_RUN_TIMEOUT_SECONDS;
    const deadline = Date.now() + timeoutSeconds * 1000;
    const ctx: AdapterContext = {
      organizationId: account.organizationId,
      integrationAccountId: account.id,
      attemptGroupId: run.attemptGroupId,
      now: new Date()
    };

    const counters: SyncCounters = {
      recordsFetched: 0,
      eventsCreated: 0,
      eventsSkipped: 0,
      recordsRejected: 0
    };
    const rejectedSamples: RejectedSample[] = [];
    const pendingBatch: TripEventCommand[] = [];

    // BullMQ-level limiter is set on the Worker. Apply an in-process token
    // gate so the same RPS budget is enforced when `execute()` is called
    // directly (e.g. from the scheduler in tests) — Requirement 13.3.
    const minIntervalMs = account.maxRequestsPerSecond
      ? Math.max(0, Math.floor(1000 / Math.max(1, account.maxRequestsPerSecond)))
      : 0;
    let nextAllowedAt = 0;

    const flushBatch = async (): Promise<void> => {
      if (pendingBatch.length === 0) return;
      const batch = pendingBatch.splice(0, pendingBatch.length);
      const result = await this.applyBatch(batch, run);
      counters.eventsCreated += result.counters.created;
      counters.eventsSkipped += result.counters.skipped;
      counters.recordsRejected += result.counters.rejected;
    };

    try {
      const cursor = this.cursorFor(run);
      const fetchIterable = adapter.fetch(account, cursor);

      for await (const payload of fetchIterable) {
        if (Date.now() >= deadline) {
          throw new SyncRunTimeoutError(
            `Sync run exceeded ${timeoutSeconds}s budget (account ${account.id})`
          );
        }
        if (minIntervalMs > 0) {
          const wait = nextAllowedAt - Date.now();
          if (wait > 0) {
            await sleep(wait);
          }
          nextAllowedAt = Date.now() + minIntervalMs;
        }

        counters.recordsFetched += 1;

        let mapResult: MapResult;
        try {
          mapResult = adapter.map(payload, ctx);
        } catch (error) {
          counters.recordsRejected += 1;
          const reason = errorToRejectionMessage(error);
          rejectedSamples.push({
            sourceReference: 'unknown',
            reason: { code: 'INVALID_PAYLOAD', message: reason }
          });
          await this.appendLog(run, 'WARN', 'VALIDATION_ERROR', reason);
          continue;
        }

        if (mapResult.kind === 'reject') {
          counters.recordsRejected += 1;
          rejectedSamples.push({
            sourceReference: mapResult.sourceReference,
            reason: mapResult.reason
          });
          await this.appendLog(
            run,
            'WARN',
            'VALIDATION_ERROR',
            `Rejected ${mapResult.sourceReference}: ${mapResult.reason.message}`,
            mapResult.sourceReference
          );
          continue;
        }

        // Tenant-scope guard (Property 3 / Requirement 2.1).
        if (mapResult.command.organizationId !== account.organizationId) {
          counters.recordsRejected += 1;
          await this.appendLog(
            run,
            'ERROR',
            'FORBIDDEN',
            'Adapter produced cross-tenant command — discarded',
            mapResult.command.sourceRef
          );
          continue;
        }

        pendingBatch.push(mapResult.command);
        if (pendingBatch.length >= DEFAULT_BATCH_SIZE) {
          await flushBatch();
        }
      }

      await flushBatch();
    } catch (error) {
      // Drain whatever we did manage to map before reporting the error.
      try {
        await flushBatch();
      } catch (flushError) {
        await this.appendLog(
          run,
          'ERROR',
          'INTEGRATION_FAILED',
          `Failed to flush pending batch: ${errorToMessage(flushError)}`
        );
      }

      return await this.handleFailure(run, account, attemptIndex, error, counters, startedAtMs);
    }

    // No throw → success or partial.
    if (counters.recordsFetched > 0 && counters.recordsRejected > 0) {
      await this.markRunPartial(run, counters);
      await this.appendLog(
        run,
        'WARN',
        'PARTIAL',
        `Run completed with ${counters.recordsRejected} rejected of ${counters.recordsFetched}`
      );
      return { status: 'PARTIAL', counters, rejectedSamples };
    }

    await this.markRunSucceeded(run, counters);
    await this.appendLog(
      run,
      'INFO',
      'SUCCEEDED',
      `Run completed (${counters.eventsCreated} created, ${counters.eventsSkipped} skipped)`
    );
    return { status: 'SUCCEEDED', counters };
  }

  // ---------------------------------------------------------------------------
  // Failure / retry handling
  // ---------------------------------------------------------------------------

  private async handleFailure(
    run: IntegrationSyncRun,
    account: IntegrationAccount,
    attemptIndex: number,
    error: unknown,
    counters: SyncCounters,
    startedAtMs: number
  ): Promise<SyncRunOutcome> {
    const classified = classifySyncError(error);
    const elapsedMs = Date.now() - startedAtMs;

    // Timeout has its own status per design (Requirement 13.4).
    if (classified.errorCode === 'TIMEOUT') {
      const willRetry = shouldRetry({
        errorCode: 'TIMEOUT',
        attemptIndex,
        elapsedMs,
        policy: SYNC_RETRY_POLICY
      });
      if (willRetry) {
        return await this.scheduleRetry(run, account, attemptIndex, classified, counters);
      }
      await this.markRunTimeout(run, counters, classified);
      return { status: 'TIMEOUT' };
    }

    const willRetry = shouldRetry({
      errorCode: classified.errorCode,
      ...(classified.httpStatus !== undefined ? { httpStatus: classified.httpStatus } : {}),
      attemptIndex,
      elapsedMs,
      policy: SYNC_RETRY_POLICY
    });

    if (willRetry) {
      return await this.scheduleRetry(run, account, attemptIndex, classified, counters);
    }

    await this.markRunFailed(run, classified, counters, account);
    return {
      status: 'FAILED',
      errorCode: classified.errorCode,
      ...(classified.httpStatus !== undefined ? { httpStatus: classified.httpStatus } : {})
    };
  }

  private async scheduleRetry(
    run: IntegrationSyncRun,
    account: IntegrationAccount,
    attemptIndex: number,
    classified: ClassifiedSyncError,
    counters: SyncCounters
  ): Promise<SyncRunOutcome> {
    const nextAttempt = attemptIndex + 1;
    const delayMs = computeRetryDelayMs({
      attemptIndex,
      base: SYNC_RETRY_POLICY.base,
      capSeconds: SYNC_RETRY_POLICY.capSeconds,
      jitter: SYNC_RETRY_POLICY.jitter
    });
    const nextRetryAt = new Date(Date.now() + delayMs);

    const scrubbedMessage = this.scrubber.scrubString(classified.message);

    await this.prisma.integrationSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'RETRYING',
        attemptIndex: nextAttempt,
        nextRetryAt,
        recordsFetched: counters.recordsFetched,
        recordsRejected: counters.recordsRejected,
        eventsCreated: counters.eventsCreated,
        eventsSkipped: counters.eventsSkipped,
        errorCode: classified.errorCode,
        errorMessage: scrubbedMessage,
        httpStatus: classified.httpStatus ?? null
      }
    });

    await this.appendLog(
      run,
      'WARN',
      classified.errorCode,
      `Retry scheduled in ${delayMs}ms (attempt ${nextAttempt})`
    );

    // Re-enqueue when BullMQ is available; otherwise the scheduler/manual
    // caller is responsible for invoking `execute()` again.
    const queue = this.queues.get(account.provider);
    if (queue) {
      try {
        await queue.add(
          'sync-run',
          {
            syncRunId: run.id,
            organizationId: run.organizationId,
            integrationAccountId: run.integrationAccountId,
            attemptIndex: nextAttempt,
            // Reuse the same attemptGroupId so adapter idempotency keys are
            // preserved across retries (Requirement 3.6).
            attemptGroupId: run.attemptGroupId
          },
          {
            jobId: `${syncJobIdForRun(run.id)}:${nextAttempt}`,
            delay: delayMs,
            removeOnComplete: 1000,
            removeOnFail: 1000
          }
        );
      } catch (enqueueError) {
        await this.appendLog(
          run,
          'ERROR',
          'INTEGRATION_FAILED',
          `Failed to enqueue retry: ${errorToMessage(enqueueError)}`
        );
      }
    }

    return { status: 'RETRYING', nextDelayMs: delayMs, attemptIndex: nextAttempt };
  }

  // ---------------------------------------------------------------------------
  // Persistence helpers
  // ---------------------------------------------------------------------------

  private async loadRun(syncRunId: string): Promise<LoadedRun | undefined> {
    const run = await this.prisma.integrationSyncRun.findUnique({
      where: { id: syncRunId },
      include: { integrationAccount: true }
    });
    if (!run) return undefined;
    const { integrationAccount, ...bareRun } = run as IntegrationSyncRun & {
      integrationAccount: IntegrationAccount;
    };
    return { run: bareRun as IntegrationSyncRun, account: integrationAccount };
  }

  private cursorFor(run: IntegrationSyncRun): SyncCursor {
    // Adapters may persist their own cursor state via `account.metadata`; we
    // pass an empty cursor here and let adapter-specific stores own that
    // detail. Future tasks can thread richer cursors through.
    void run;
    return {};
  }

  private async applyBatch(
    batch: TripEventCommand[],
    run: IntegrationSyncRun
  ): Promise<TripEventApplyResult> {
    if (!this.tripEventApply) {
      // Task 6.1 has not landed yet — emit a placeholder result so the worker
      // remains testable and persists the records-fetched counter. Every
      // command counts as a "rejected" until applyCommand becomes available.
      await this.appendLog(
        run,
        'WARN',
        'INTEGRATION_FAILED',
        'TripEventApplyPort not wired — batch dropped (TODO task 6.1)'
      );
      return {
        outcomes: batch.map<{
          kind: 'rejected';
          idempotencyKey: string;
          reason: string;
        }>((command) => ({
          kind: 'rejected',
          idempotencyKey: command.idempotencyKey,
          reason: 'TRIP_EVENT_APPLY_PORT_UNAVAILABLE'
        })),
        counters: { created: 0, skipped: 0, rejected: batch.length }
      };
    }

    const ctx: TripEventApplyContext = {
      syncRunId: run.id,
      attemptGroupId: run.attemptGroupId
    };
    return await this.tripEventApply.applyCommand(batch, ctx);
  }

  private async markRunRunning(run: IntegrationSyncRun, attemptIndex: number): Promise<void> {
    await this.prisma.integrationSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'RUNNING',
        attemptIndex,
        nextRetryAt: null,
        errorCode: null,
        errorMessage: null,
        httpStatus: null
      }
    });
  }

  private async markRunSucceeded(run: IntegrationSyncRun, counters: SyncCounters): Promise<void> {
    await this.prisma.integrationSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'SUCCEEDED',
        finishedAt: new Date(),
        recordsFetched: counters.recordsFetched,
        recordsRejected: counters.recordsRejected,
        eventsCreated: counters.eventsCreated,
        eventsSkipped: counters.eventsSkipped,
        errorCode: null,
        errorMessage: null,
        httpStatus: null,
        nextRetryAt: null
      }
    });
  }

  private async markRunPartial(run: IntegrationSyncRun, counters: SyncCounters): Promise<void> {
    await this.prisma.integrationSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'PARTIAL',
        finishedAt: new Date(),
        recordsFetched: counters.recordsFetched,
        recordsRejected: counters.recordsRejected,
        eventsCreated: counters.eventsCreated,
        eventsSkipped: counters.eventsSkipped,
        nextRetryAt: null
      }
    });
  }

  private async markRunFailed(
    run: IntegrationSyncRun,
    classified: { errorCode: SyncErrorCode; message: string; httpStatus?: number },
    counters?: SyncCounters,
    account?: IntegrationAccount
  ): Promise<void> {
    const scrubbedMessage = this.scrubber.scrubString(classified.message);
    await this.prisma.integrationSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorCode: classified.errorCode,
        errorMessage: scrubbedMessage,
        httpStatus: classified.httpStatus ?? null,
        nextRetryAt: null,
        ...(counters
          ? {
              recordsFetched: counters.recordsFetched,
              recordsRejected: counters.recordsRejected,
              eventsCreated: counters.eventsCreated,
              eventsSkipped: counters.eventsSkipped
            }
          : {})
      }
    });
    await this.appendLog(run, 'ERROR', classified.errorCode, scrubbedMessage);

    // Publish a `SyncRunFailedEvent` so the `NotificationOrchestrator`
    // can fan out the mandatory `sync_run_failed` notification to org
    // admins (Requirements 3.4, 3.5). We only emit when the account
    // context is available — the no-adapter early-failure path always
    // supplies it; the `handleFailure` path threads it through too.
    // Emission is best-effort: an event-bus failure must never roll back
    // the run's `FAILED` state, which is already committed.
    if (account && this.eventEmitter) {
      const payload: SyncRunFailedEvent = {
        syncRunId: run.id,
        organizationId: run.organizationId,
        integrationAccountId: account.id,
        provider: account.provider,
        failedAt: new Date(),
        errorCode: classified.errorCode,
        errorMessage: scrubbedMessage
      };
      try {
        this.eventEmitter.emit(SYNC_RUN_FAILED_EVENT, payload);
      } catch (error) {
        this.logger.warn(
          `Failed to emit ${SYNC_RUN_FAILED_EVENT} for run ${run.id}: ${errorToMessage(error)}`
        );
      }
    }
  }

  private async markRunTimeout(
    run: IntegrationSyncRun,
    counters: SyncCounters,
    classified: ClassifiedSyncError
  ): Promise<void> {
    const scrubbedMessage = this.scrubber.scrubString(classified.message);
    await this.prisma.integrationSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'TIMEOUT',
        finishedAt: new Date(),
        recordsFetched: counters.recordsFetched,
        recordsRejected: counters.recordsRejected,
        eventsCreated: counters.eventsCreated,
        eventsSkipped: counters.eventsSkipped,
        errorCode: 'TIMEOUT',
        errorMessage: scrubbedMessage,
        nextRetryAt: null
      }
    });
    await this.appendLog(run, 'ERROR', 'TIMEOUT', scrubbedMessage);
  }

  private async appendLog(
    run: IntegrationSyncRun,
    level: 'INFO' | 'WARN' | 'ERROR',
    code: string,
    message: string,
    sourceReference?: string,
    rawPayload?: unknown
  ): Promise<void> {
    const safeMessage = this.scrubber.scrubString(message);
    const data: Prisma.IntegrationSyncLogUncheckedCreateInput = {
      organizationId: run.organizationId,
      syncRunId: run.id,
      level,
      code,
      message: safeMessage,
      ...(sourceReference !== undefined ? { sourceReference } : {}),
      ...(rawPayload !== undefined
        ? { rawPayloadMasked: this.scrubber.scrub(rawPayload) as Prisma.InputJsonValue }
        : {})
    };
    try {
      await this.prisma.integrationSyncLog.create({ data });
    } catch (error) {
      // Logging must never crash the worker.
      this.logger.warn(`Failed to append IntegrationSyncLog: ${errorToMessage(error)}`);
    }
  }

  // ---------------------------------------------------------------------------
  // BullMQ wiring
  // ---------------------------------------------------------------------------

  private startProviderWorker(provider: IntegrationProvider): void {
    if (!this.redisConnection) return;

    const queueName = syncQueueNameForProvider(provider);
    const queue = new Queue<SyncRunJobData>(queueName, {
      connection: this.redisConnection
    });
    this.queues.set(provider, queue);

    const limiterMax = Math.max(
      1,
      this.config.get<number>(`SYNC_WORKER_${provider}_RPS`) ??
        this.config.get<number>('SYNC_WORKER_DEFAULT_RPS') ??
        10
    );

    const workerOptions: WorkerOptions = {
      connection: this.redisConnection,
      concurrency: this.config.get<number>('SYNC_WORKER_CONCURRENCY') ?? DEFAULT_WORKER_CONCURRENCY,
      limiter: { max: limiterMax, duration: DEFAULT_RATE_LIMIT_WINDOW_MS }
    };

    const worker = new Worker<SyncRunJobData>(
      queueName,
      async (job: Job<SyncRunJobData>) => {
        const { syncRunId, attemptIndex } = job.data;
        const outcome = await this.execute(syncRunId, attemptIndex);
        return outcome;
      },
      workerOptions
    );
    worker.on('failed', (job, error) => {
      this.logger.error(
        `BullMQ ${queueName} job ${job?.id ?? 'unknown'} failed: ${errorToMessage(error)}`,
        error instanceof Error ? error.stack : undefined
      );
    });
    this.workers.set(provider, worker);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

function errorToRejectionMessage(error: unknown): string {
  if (error instanceof Error) return `Adapter map() threw: ${error.message}`;
  return 'Adapter map() threw an unknown error';
}
