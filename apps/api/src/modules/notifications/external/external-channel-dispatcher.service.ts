/**
 * `ExternalChannelDispatcher`
 *
 * BullMQ-backed worker that delivers `Notification` rows whose channel is
 * `ZALO_OA` / `SMS` / `EMAIL`. The dispatcher owns three independent queues
 * — one per channel — so a slow Zalo OA endpoint never starves SMS/email
 * delivery (design.md §"External Channel Dispatcher", Requirement 9.2).
 *
 * Job payload contract: `{ notificationId }`. Content is **never** inlined;
 * the worker re-loads the row, lets the adapter re-render the
 * Vietnamese-friendly template, and dispatches. Re-loading on every attempt
 * keeps adapters stateless and survives template/rule edits between the
 * insert and the dispatch (Requirement 9.2, design.md §"External Channel
 * Dispatcher").
 *
 * Failure model:
 * - Recipient missing email/phone for the channel → mark `FAILED` with
 *   `failureReason = 'MISSING_CONTACT'`, no retry (Requirement 9.3).
 * - No adapter registered for the channel → mark `FAILED` with
 *   `'NO_ADAPTER_REGISTERED'`, no retry (defensive — should be impossible
 *   once `NotificationsModule` wires all three adapters).
 * - Adapter returns `SENT` → flip to `SENT`, stamp `sentAt`, persist
 *   `payloadDigest` for audit cross-reference (Requirement 11.4).
 * - Adapter returns `FAILED` with `transient = true` → throw so BullMQ
 *   retries; backoff is `computeRetryDelayMs` against
 *   `EXTERNAL_CHANNEL_RETRY_POLICY` (max 3 retries, exponential, base 2,
 *   cap 300s — Requirement 9.4).
 * - Adapter returns `FAILED` with `transient = false` → mark `FAILED` with
 *   the (already-sanitized) `failureReason`, no retry (Requirement 9.5).
 *
 * Startup recovery: scans `Notification WHERE status='PENDING' AND channel
 * IN ('ZALO_OA','SMS','EMAIL')` and re-enqueues. This complements the
 * orchestrator hook — the orchestrator enqueues post-insert during normal
 * operation; the startup scan catches rows that were inserted while Redis
 * was unavailable (offline fallback per Requirement 8.4 also applies here)
 * or while a previous worker process crashed before flushing its queue.
 *
 * Validates: Requirements 9.2, 9.3, 9.4, 9.5
 * Cross-ref: design.md §"External Channel Dispatcher"; sibling task 13.1.
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, UnrecoverableError } from 'bullmq';
import type { Job, JobsOptions, WorkerOptions } from 'bullmq';
import { createHash } from 'node:crypto';
import IORedis from 'ioredis';
import {
  computeRetryDelayMs,
  defaultSensitiveScrubber,
  EXTERNAL_CHANNEL_RETRY_POLICY,
  type SensitiveScrubber
} from '@gatesync/shared';
import { NotificationChannel, NotificationStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EXTERNAL_CHANNEL_ADAPTERS,
  type ExternalChannelKind,
  type ExternalChannelRegistry,
  type ExternalDispatchInput,
  type ExternalDispatchResult
} from './external-channel.port';

/** Job payload — `Notification.id` only (Requirement 9.2). */
export interface ExternalDispatchJobData {
  notificationId: string;
}

/** Channels handled by this dispatcher. */
const EXTERNAL_CHANNELS = [
  NotificationChannel.ZALO_OA,
  NotificationChannel.SMS,
  NotificationChannel.EMAIL
] as const;

/** Stable mapping between DB `NotificationChannel` and adapter `kind`. */
const CHANNEL_TO_KIND: Readonly<Record<(typeof EXTERNAL_CHANNELS)[number], ExternalChannelKind>> = {
  [NotificationChannel.ZALO_OA]: 'zalo',
  [NotificationChannel.SMS]: 'sms',
  [NotificationChannel.EMAIL]: 'email'
};

/** Per-channel queue names per design.md §"External Channel Dispatcher". */
const CHANNEL_TO_QUEUE: Readonly<Record<(typeof EXTERNAL_CHANNELS)[number], string>> = {
  [NotificationChannel.ZALO_OA]: 'notification-external-zalo',
  [NotificationChannel.SMS]: 'notification-external-sms',
  [NotificationChannel.EMAIL]: 'notification-external-email'
};

/** Default BullMQ worker concurrency per channel queue. */
const DEFAULT_WORKER_CONCURRENCY = 4;

/**
 * Vietnamese title fallback used when the persisted `Notification.payload`
 * does not carry a pre-rendered title (e.g. a row enqueued by code paths
 * that pre-date the orchestrator template work). The dispatcher prefers
 * `payload.title` when present.
 */
const FALLBACK_TITLE = 'Thông báo GateSync';

/** Subset of the `Notification.payload` JSON we read on the worker side. */
interface NotificationPayloadShape {
  title?: unknown;
  body?: unknown;
  eventType?: unknown;
  occurredAt?: unknown;
  // Adapter-specific structured data (e.g. Zalo template params); already
  // scrubbed upstream when present.
  params?: unknown;
}

/**
 * BullMQ-backed dispatcher that drains external `Notification` rows.
 *
 * The service is intentionally Redis-aware: when `REDIS_URL` is missing
 * the dispatcher logs once and stays inert so dev/test environments can
 * still boot. The orchestrator's `enqueue` calls become no-ops in that
 * mode; rows remain `PENDING` and will be picked up by the next worker
 * with Redis configured.
 */
@Injectable()
export class ExternalChannelDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExternalChannelDispatcher.name);
  private readonly scrubber: SensitiveScrubber = defaultSensitiveScrubber;

  /** Lazy Redis connection; undefined when `REDIS_URL` is not set. */
  private redisConnection?: IORedis;
  /** Per-channel queues for both producer (orchestrator hook) and worker. */
  private readonly queues = new Map<
    (typeof EXTERNAL_CHANNELS)[number],
    Queue<ExternalDispatchJobData>
  >();
  /** Per-channel workers. */
  private readonly workers = new Map<
    (typeof EXTERNAL_CHANNELS)[number],
    Worker<ExternalDispatchJobData>
  >();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Optional()
    @Inject(EXTERNAL_CHANNEL_ADAPTERS)
    private readonly registry: ExternalChannelRegistry | null = null
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async onModuleInit(): Promise<void> {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn(
        'ExternalChannelDispatcher: REDIS_URL not configured — external channel delivery disabled, rows will remain PENDING.'
      );
      return;
    }

    this.redisConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.redisConnection.on('error', (error) => {
      // Log + swallow; ioredis auto-reconnects. Throwing here would crash
      // the API when Redis blips, which is a worse failure mode than
      // letting `Notification.status = PENDING` rows wait until reconnect.
      this.logger.warn(`ExternalChannelDispatcher Redis unavailable: ${error.message}`);
    });

    for (const channel of EXTERNAL_CHANNELS) {
      this.startChannel(channel);
    }

    // Startup recovery scan — see class doc.
    await this.recoverPendingRows();
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
  // Public producer API (used by the orchestrator hook)
  // ---------------------------------------------------------------------------

  /**
   * Enqueue a delivery job for a freshly-persisted external `Notification`.
   *
   * Called by the `Notification_Orchestrator` after committing a row with
   * `status = PENDING` for an external channel. Safe to invoke when Redis
   * is unwired — the call no-ops and the row will be picked up by the next
   * dispatcher process (or by `recoverPendingRows()` on startup).
   *
   * The `jobId` is derived from `notificationId` so a duplicate enqueue
   * (e.g. the orchestrator retried after a transient error) is idempotent
   * at the BullMQ layer; the worker also re-checks `status` before
   * dispatching, providing a second idempotency guard.
   */
  async enqueue(notificationId: string, channel: NotificationChannel): Promise<void> {
    if (!this.isExternalChannel(channel)) {
      // Defensive — the orchestrator already filters, but this keeps the
      // API safe for direct callers (tests, scripts).
      return;
    }
    const queue = this.queues.get(channel);
    if (!queue) {
      // Redis unwired or not yet initialised. The startup recovery scan
      // (or a future replay) will pick the row up; no need to block the
      // orchestrator on infrastructure availability.
      return;
    }

    try {
      await queue.add('dispatch', { notificationId }, this.buildJobOptions(notificationId));
    } catch (error) {
      // Producer-side failures must not surface back to the orchestrator;
      // the row is already persisted and will be recovered on next boot.
      this.logger.warn(
        `ExternalChannelDispatcher.enqueue failed (notificationId=${notificationId}, channel=${channel}): ${this.errorMessage(error)}`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Worker entry point (exposed for tests)
  // ---------------------------------------------------------------------------

  /**
   * Process a single dispatch job. Public so unit tests can drive the
   * dispatcher synchronously without spinning up Redis. Throws on
   * transient failure so BullMQ schedules a retry; resolves normally on
   * permanent outcomes (SENT, missing contact, no adapter, permanent
   * provider rejection).
   */
  async processJob(notificationId: string): Promise<void> {
    // 1. Load notification; idempotency check.
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: {
        id: true,
        organizationId: true,
        tripId: true,
        recipientUserId: true,
        channel: true,
        status: true,
        payload: true
      }
    });

    if (!notification) {
      // Row was deleted between enqueue and dispatch. Nothing to do.
      this.logger.warn(
        `ExternalChannelDispatcher: notification ${notificationId} not found, dropping job`
      );
      return;
    }

    if (notification.status !== NotificationStatus.PENDING) {
      // Already SENT / FAILED / READ / HIDDEN / PENDING_IN_APP — idempotent
      // skip. This is the expected case for replayed jobs (Requirement 9.2,
      // design.md §"External Channel Dispatcher" — adapters re-load the row
      // every attempt).
      return;
    }

    if (!this.isExternalChannel(notification.channel)) {
      // Defensive — only external channels are dispatched here. Mark as
      // failed so it is auditable rather than silently lost.
      await this.markFailed(notificationId, 'INVALID_CHANNEL_FOR_EXTERNAL_DISPATCHER');
      return;
    }

    // 2. Resolve recipient contact.
    if (!notification.recipientUserId) {
      await this.markFailed(notificationId, 'MISSING_CONTACT');
      return;
    }
    const contact = await this.loadContact(
      notification.recipientUserId,
      notification.organizationId,
      notification.channel
    );
    if (!contact) {
      // Per Requirement 9.3 — `MISSING_CONTACT` is a permanent failure.
      await this.markFailed(notificationId, 'MISSING_CONTACT');
      return;
    }

    // 3. Resolve adapter.
    const kind = CHANNEL_TO_KIND[notification.channel];
    const adapter = this.registry?.get(kind);
    if (!adapter) {
      await this.markFailed(notificationId, 'NO_ADAPTER_REGISTERED');
      return;
    }

    // 4. Build adapter input from the persisted payload.
    const payload = this.coercePayload(notification.payload);
    const params = this.coerceParams(payload);
    const dispatchInput: ExternalDispatchInput = {
      deliveryId: notification.id,
      recipientUserId: notification.recipientUserId,
      recipientContact: contact,
      ...(notification.tripId ? { tripId: notification.tripId } : {}),
      eventType: this.coerceString(payload?.eventType, 'unknown'),
      title: this.coerceString(payload?.title, FALLBACK_TITLE),
      body: this.coerceString(payload?.body, ''),
      ...(params ? { payload: params } : {})
    };

    // 5. Send.
    let result: ExternalDispatchResult;
    try {
      result = await adapter.send(dispatchInput);
    } catch (error) {
      // Treat thrown errors as transient — the adapter contract is
      // discriminated-result-based, but stubs / future implementations may
      // throw on network errors. Sanitize before rethrowing to BullMQ so
      // logs never carry raw provider responses (Requirement 9.5 / 11.4).
      const sanitized = this.sanitizeFailureReason(this.errorMessage(error));
      this.logger.warn(
        `ExternalChannelDispatcher adapter threw (notificationId=${notificationId}, channel=${notification.channel}): ${sanitized}`
      );
      throw new Error(sanitized);
    }

    // 6. Persist outcome.
    if (result.status === 'SENT') {
      const payloadDigest = this.computePayloadDigest(dispatchInput);
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          payloadDigest
        }
      });
      return;
    }

    // result.status === 'FAILED'
    const sanitizedReason = this.sanitizeFailureReason(result.failureReason);
    if (result.transient) {
      // Surface to BullMQ so the queue's retry policy applies. The row
      // stays `PENDING` between attempts — only the final attempt flips
      // to `FAILED` via the worker's `failed` handler (see startChannel).
      throw new Error(sanitizedReason);
    }

    // Permanent failure: mark FAILED, no retry. Use UnrecoverableError so
    // BullMQ records the job as failed without consuming retry budget.
    await this.markFailed(notificationId, sanitizedReason);
    throw new UnrecoverableError(sanitizedReason);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private startChannel(channel: (typeof EXTERNAL_CHANNELS)[number]): void {
    if (!this.redisConnection) return;

    const queueName = CHANNEL_TO_QUEUE[channel];
    const queue = new Queue<ExternalDispatchJobData>(queueName, {
      connection: this.redisConnection
    });
    this.queues.set(channel, queue);

    const workerOptions: WorkerOptions = {
      connection: this.redisConnection,
      concurrency:
        this.config.get<number>('NOTIFICATIONS_DISPATCHER_CONCURRENCY') ??
        DEFAULT_WORKER_CONCURRENCY
    };

    const worker = new Worker<ExternalDispatchJobData>(
      queueName,
      async (job: Job<ExternalDispatchJobData>) => {
        await this.processJob(job.data.notificationId);
      },
      workerOptions
    );

    worker.on('failed', (job, error) => {
      // BullMQ exhausted the retry budget for a transient failure. Flip
      // the row to `FAILED` so it stops being recovered on next boot.
      const notificationId = job?.data.notificationId;
      this.logger.error(
        `BullMQ ${queueName} job ${job?.id ?? 'unknown'} failed: ${this.errorMessage(error)}`
      );
      if (!notificationId) return;
      const attemptsMade = job?.attemptsMade ?? 0;
      const maxAttempts = job?.opts.attempts ?? EXTERNAL_CHANNEL_RETRY_POLICY.maxRetries + 1;
      // Only mark FAILED on the terminal attempt — earlier `failed`
      // events fire between retries and the row should stay PENDING so
      // the next attempt picks it up.
      if (attemptsMade >= maxAttempts) {
        const reason = this.sanitizeFailureReason(this.errorMessage(error));
        void this.markFailed(notificationId, reason).catch((updateError) => {
          this.logger.warn(
            `Failed to flip notification ${notificationId} to FAILED after retry exhaustion: ${this.errorMessage(updateError)}`
          );
        });
      }
    });

    this.workers.set(channel, worker);
  }

  /**
   * Build per-job options. Retry math is sourced from
   * {@link EXTERNAL_CHANNEL_RETRY_POLICY} so this dispatcher and any
   * tests / docs see exactly the same numbers (Requirement 9.4).
   *
   * BullMQ counts the initial attempt in `attempts`; our policy's
   * `maxRetries` excludes the initial attempt, so `attempts = maxRetries +
   * 1`.
   *
   * BullMQ supports `backoff: { type: 'exponential', delay }` natively, but
   * `computeRetryDelayMs` is the canonical math (and applies jitter), so we
   * compute the effective per-attempt delays once at startup and rely on
   * BullMQ's `exponential` strategy with `delay = base^attemptIndex * 1000`
   * plus `attemptsMade`-aware jitter via the worker's `failed` hook would
   * be over-engineered for the current ask. We instead pass the policy's
   * base delay and let BullMQ compute `delay * 2^(attemptsMade - 1)`,
   * which matches `EXTERNAL_CHANNEL_RETRY_POLICY` (base = 2). The `cap` is
   * enforced by `EXTERNAL_CHANNEL_RETRY_POLICY.capSeconds`; BullMQ does not
   * cap exponential backoff itself, but with `maxRetries = 3` and `base =
   * 2` the largest natural delay (2^3 * 1s = 8s) is far below 300s, so
   * the cap is effectively unreachable.
   */
  private buildJobOptions(notificationId: string): JobsOptions {
    const initialDelayMs = computeRetryDelayMs({
      attemptIndex: 0,
      base: EXTERNAL_CHANNEL_RETRY_POLICY.base,
      capSeconds: EXTERNAL_CHANNEL_RETRY_POLICY.capSeconds,
      jitter: () => 0
    });
    return {
      // De-dup at the BullMQ layer; the worker also re-checks status.
      jobId: `notification:${notificationId}`,
      attempts: EXTERNAL_CHANNEL_RETRY_POLICY.maxRetries + 1,
      backoff: {
        type: 'exponential',
        delay: initialDelayMs
      },
      removeOnComplete: 1000,
      removeOnFail: 1000
    };
  }

  /**
   * Recover `PENDING` external notifications on startup (orphan cleanup).
   * Runs after queue/worker init so `enqueue` is wired. Failures inside
   * the loop are logged and ignored — the row stays `PENDING` and will be
   * retried on the next boot.
   */
  private async recoverPendingRows(): Promise<void> {
    if (this.queues.size === 0) return;

    try {
      const pending = await this.prisma.notification.findMany({
        where: {
          status: NotificationStatus.PENDING,
          channel: { in: [...EXTERNAL_CHANNELS] }
        },
        select: { id: true, channel: true },
        // Bound the recovery to a sensible page; if a backlog exists, the
        // worker can drain via the orchestrator hook + subsequent boots.
        take: 1000
      });

      if (pending.length === 0) return;

      this.logger.log(
        `ExternalChannelDispatcher: recovering ${pending.length} pending external notification(s)`
      );

      for (const row of pending) {
        if (!this.isExternalChannel(row.channel)) continue;
        await this.enqueue(row.id, row.channel);
      }
    } catch (error) {
      this.logger.warn(
        `ExternalChannelDispatcher startup recovery failed: ${this.errorMessage(error)}`
      );
    }
  }

  private async loadContact(
    userId: string,
    organizationId: string,
    channel: (typeof EXTERNAL_CHANNELS)[number]
  ): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        phone: true,
        driverProfile: {
          where: { organizationId, deletedAt: null },
          select: { phone: true }
        }
      }
    });

    if (!user) return null;

    if (channel === NotificationChannel.EMAIL) {
      return typeof user.email === 'string' && user.email.length > 0 ? user.email : null;
    }
    // SMS / Zalo OA both use phone. Fall back to driver profile phone for
    // driver-only accounts that don't carry a `User.phone`.
    const phone = user.phone ?? user.driverProfile?.phone ?? null;
    return typeof phone === 'string' && phone.length > 0 ? phone : null;
  }

  private async markFailed(notificationId: string, failureReason: string): Promise<void> {
    try {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.FAILED,
          failedAt: new Date(),
          failureReason
        }
      });
    } catch (error) {
      // Update conflicts (e.g. row deleted, concurrent SENT) are non-fatal;
      // log + continue so the worker doesn't loop on the same job.
      this.logger.warn(
        `ExternalChannelDispatcher.markFailed (notificationId=${notificationId}, reason=${failureReason}) update failed: ${this.errorMessage(error)}`
      );
    }
  }

  private isExternalChannel(
    channel: NotificationChannel
  ): channel is (typeof EXTERNAL_CHANNELS)[number] {
    return (EXTERNAL_CHANNELS as readonly NotificationChannel[]).includes(channel);
  }

  private coercePayload(value: Prisma.JsonValue | null): NotificationPayloadShape | null {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as unknown as NotificationPayloadShape;
  }

  private coerceString(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.length > 0 ? value : fallback;
  }

  private coerceParams(payload: NotificationPayloadShape | null): Record<string, unknown> | null {
    if (!payload) return null;
    const params = payload.params;
    if (params === null || params === undefined) return null;
    if (typeof params !== 'object' || Array.isArray(params)) return null;
    return params as Record<string, unknown>;
  }

  /**
   * Deterministic SHA-256 of the dispatch input. Mirrors the per-adapter
   * digest math so audit trails align across the dispatcher row update
   * and any future provider-side cross-check (Requirement 11.4).
   */
  private computePayloadDigest(input: ExternalDispatchInput): string {
    const digestInput = {
      deliveryId: input.deliveryId,
      recipientUserId: input.recipientUserId,
      recipientContact: input.recipientContact,
      tripId: input.tripId ?? null,
      eventType: input.eventType,
      title: input.title,
      body: input.body,
      payload: input.payload ?? null
    };
    return createHash('sha256').update(JSON.stringify(digestInput)).digest('hex');
  }

  /**
   * Mask any sensitive substring that might have leaked into a provider
   * error message before persisting it to `failureReason` (Requirement
   * 9.5 / 11.4). Caps length so a verbose stack trace doesn't blow up the
   * column.
   */
  private sanitizeFailureReason(reason: string): string {
    const scrubbed = this.scrubber.scrubString(reason ?? 'UNKNOWN_ERROR');
    return scrubbed.length > 500 ? scrubbed.slice(0, 500) : scrubbed;
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown error';
  }
}
