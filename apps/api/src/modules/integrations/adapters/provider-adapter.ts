/**
 * Provider adapter interfaces for the AUTO SYNC pipeline.
 *
 * These types define the contract between the integrations `SyncWorker` and
 * each concrete provider (Cua Khau So, yard, GPS, mock, ...). Adapters are
 * pure, stateless mappers that transform external payloads into normalized
 * `TripEventCommand`s consumed by the trip event service.
 *
 * Validates: Requirements 2.1, 2.2, 2.5
 * Cross-ref: design.md sections "Provider Adapter (Mapper)" and
 *            "Sync Worker" / "SyncRunOutcome".
 */

import type {
  IntegrationAccount,
  IntegrationProvider,
  Prisma,
  TripEventSource,
  TripEventType
} from '@prisma/client';
import type { SyncErrorCode } from '@gatesync/shared';

export type { IntegrationProvider };

/**
 * Cursor / pagination state passed to `ProviderAdapter.fetch`. Concrete
 * providers extend this with provider-specific fields. Keep the shape
 * minimal here so the worker can persist and replay it generically.
 */
export interface SyncCursor {
  /** Highest `occurredAt` already observed on a previous run (UTC). */
  lastObservedAt?: Date;
  /** Opaque continuation token, e.g. provider page cursor. */
  cursor?: string;
}

/**
 * Context surfaced to `ProviderAdapter.map` so adapters can stamp
 * tenant scope and idempotency keys without reaching for ambient state.
 */
export interface AdapterContext {
  /** Tenant scope of the current `Sync_Run`. Adapters MUST copy this onto every command. */
  organizationId: string;
  /** Identifier of the `IntegrationAccount` driving the run. */
  integrationAccountId: string;
  /**
   * Stable identifier shared across all retry attempts of the same logical run.
   * Used to keep `idempotencyKey`s identical across retries (Requirement 3.6).
   */
  attemptGroupId: string;
  /** Optional clock injection point for deterministic tests. */
  now?: Date;
}

/** Discriminated reasons for rejecting a malformed external record (Requirement 2.5). */
export type RejectionReason =
  | {
      code: 'MISSING_REQUIRED_FIELD';
      /** Dotted path of the missing field on the source payload. */
      field: string;
      message: string;
    }
  | {
      code: 'INVALID_OCCURRED_AT';
      /** Field that produced the invalid timestamp, when applicable. */
      field?: string;
      message: string;
    }
  | {
      code: 'INVALID_PAYLOAD';
      field?: string;
      message: string;
    };

/**
 * Actor stamped on a domain command. AUTO SYNC commands always set
 * `kind = 'integration'`; manual or driver flows produce different actors
 * upstream of the adapter layer.
 */
export interface AdapterActor {
  kind: 'integration' | 'system';
  /** `IntegrationAccount.id` for `integration` actors. */
  id?: string;
}

/**
 * Normalized command produced by adapters and consumed by `Trip_Event_Service`.
 *
 * The command MUST be tenant-scoped (`organizationId`) and carry a deterministic
 * `idempotencyKey` so that retries and concurrent runs collapse onto the same
 * `TripEvent` row.
 */
export interface TripEventCommand {
  /** Tenant scope; equal to the source `IntegrationAccount.organizationId`. */
  organizationId: string;
  /**
   * Resolved trip identifier. Adapters that cannot resolve `tripId` directly
   * SHALL emit a `reject` outcome instead of fabricating a value; trip
   * resolution by external keys is the responsibility of upstream stages.
   */
  tripId: string;
  /** Domain event type (matches the `TripEventType` Prisma enum). */
  eventType: TripEventType;
  /** Where this event came from (Prisma enum). */
  source: TripEventSource;
  /** Stable per-provider record reference (e.g. `declarationNumber + lineId`). */
  sourceRef: string;
  /**
   * Deterministic idempotency key built from `(provider, sourceRef, occurredAtUtcSecond)`.
   * See `apps/api/src/modules/integrations/idempotency-key.ts`.
   */
  idempotencyKey: string;
  /** Time the event happened at the source (UTC). */
  occurredAt: Date;
  /** Optional normalized payload retained on the trip event. */
  payload?: Prisma.InputJsonValue;
  /** Actor metadata for audit / domain event emission. */
  actor?: AdapterActor;
  /**
   * Marks the produced `TripEvent.isCorrection`. Adapters set this to `true`
   * for amendment flows so downstream notification orchestration can suppress
   * delivery (Requirement 5.4). Defaults to `false`.
   */
  isCorrection?: boolean;
}

/** Discriminated result of mapping a single provider record. */
export type MapResult =
  | { kind: 'event'; command: TripEventCommand }
  | { kind: 'reject'; sourceReference: string; reason: RejectionReason };

/**
 * Provider adapter contract.
 *
 * Implementations MUST:
 *  - Be stateless and pure given `(account, payload, ctx)`.
 *  - Stamp `command.organizationId` from `ctx.organizationId` (Property 3).
 *  - Reject malformed records via `MapResult { kind: 'reject' }` rather than
 *    throwing (Property 4 / Requirement 2.5).
 *  - Produce identical `idempotencyKey`s across retry attempts that share
 *    the same `ctx.attemptGroupId` (Property 5 / Requirement 3.6).
 */
export interface ProviderAdapter<TPayload> {
  readonly provider: IntegrationProvider;
  fetch(account: IntegrationAccount, cursor: SyncCursor): AsyncIterable<TPayload>;
  map(payload: TPayload, ctx: AdapterContext): MapResult;
}

/** Per-run counters tracked by the worker and persisted to `IntegrationSyncRun`. */
export interface SyncCounters {
  recordsFetched: number;
  eventsCreated: number;
  eventsSkipped: number;
  recordsRejected: number;
}

/** Sample of a rejected record surfaced to admins via `Sync_Log`. */
export interface RejectedSample {
  sourceReference: string;
  reason: RejectionReason;
}

/** Re-export the shared `SyncErrorCode` taxonomy so consumers depend on a single namespace. */
export type { SyncErrorCode };

/**
 * Discriminated outcome of a single `Sync_Run` execution attempt.
 * Mirrors the design's `SyncRunOutcome` and drives `IntegrationSyncRun.status`
 * transitions inside the worker.
 */
export type SyncRunOutcome =
  | { status: 'SUCCEEDED'; counters: SyncCounters }
  | { status: 'PARTIAL'; counters: SyncCounters; rejectedSamples: RejectedSample[] }
  | { status: 'RETRYING'; nextDelayMs: number; attemptIndex: number }
  | { status: 'FAILED'; errorCode: SyncErrorCode; httpStatus?: number }
  | { status: 'TIMEOUT' };
