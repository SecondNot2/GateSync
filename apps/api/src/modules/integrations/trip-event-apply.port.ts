/**
 * Port between {@link SyncWorker} and {@link TripEventService.applyCommand}
 * (task 6.1, in parallel).
 *
 * The worker depends only on this narrow interface so that:
 *  - Sibling tasks can land out of order (the worker compiles even if task
 *    6.1 has not yet exported the full `TripEventService` symbol).
 *  - Tests can substitute a deterministic in-memory implementation without
 *    pulling the full Prisma stack.
 *
 * Cross-ref: design.md "Trip Event Service" — `applyCommand` accepts a batch
 * of `TripEventCommand`s, performs idempotency lookup + insert in a single
 * `prisma.$transaction`, and returns per-command outcomes.
 *
 * TODO(task 6.1): remove the placeholder shim and have the trip module
 * implement and export `TripEventApplyPort` directly.
 */

import type { Prisma } from '@prisma/client';
import type { TripEventCommand } from './adapters/provider-adapter';

/** Discriminated outcome returned by `applyCommand` for a single command. */
export type TripEventApplyOutcome =
  | { kind: 'created'; idempotencyKey: string; tripEventId: string }
  | { kind: 'skipped'; idempotencyKey: string; tripEventId: string }
  | { kind: 'rejected'; idempotencyKey: string; reason: string };

/** Aggregate result of applying a batch of commands. */
export interface TripEventApplyResult {
  /** Per-command outcomes in the same order as the input batch. */
  outcomes: TripEventApplyOutcome[];
  /** Convenience counters; `outcomes` is the source of truth. */
  counters: {
    created: number;
    skipped: number;
    rejected: number;
  };
}

/**
 * Optional context the worker passes to `applyCommand` so the service can
 * stamp per-run counters and audit metadata in the same transaction.
 */
export interface TripEventApplyContext {
  /** `IntegrationSyncRun.id` whose counters should be incremented. */
  syncRunId?: string;
  /** Stable group id shared across retry attempts (Requirement 3.6). */
  attemptGroupId?: string;
  /**
   * Optional caller-supplied transaction. When omitted, the implementation
   * SHALL open its own transaction.
   */
  tx?: Prisma.TransactionClient;
}

/**
 * Narrow port consumed by {@link SyncWorker}. The full `TripEventService`
 * exposes additional methods, but the worker only needs this entry point.
 */
export interface TripEventApplyPort {
  applyCommand(
    commands: TripEventCommand[],
    context: TripEventApplyContext
  ): Promise<TripEventApplyResult>;
}

/**
 * Injection token for the trip-event apply port. Task 6.1 / 17.1 will provide
 * the concrete `TripEventService` under this token. Tests can override it
 * with a stub implementation.
 */
export const TRIP_EVENT_APPLY_PORT = Symbol.for(
  'gatesync.trips.tripEventApplyPort'
) as unknown as symbol;
