/**
 * Server-side helper for building the deterministic idempotency key used
 * by every `ProviderAdapter` to collapse duplicate / retried trip event
 * commands onto a single `TripEvent` row.
 *
 * Algorithm: `sha1(`${provider}|${sourceReference}|${floor(occurredAt.getTime()/1000)}`)`.
 *
 * `occurredAt.getTime()` is timezone-independent so the helper is safe to
 * call with `Date` objects produced by either UTC or localtime parsers —
 * the millisecond → second `Math.floor` strips sub-second jitter so retried
 * payloads with millisecond drift still produce the same key (Requirement 3.6).
 *
 * Lives inside `apps/api` (rather than `@gatesync/shared`) because it
 * imports `node:crypto`. Exposing it from the shared package would drag
 * `node:crypto` into the Next.js web bundle, which webpack cannot handle
 * (`UnhandledSchemeError`).
 *
 * Validates: Requirements 2.2, 3.6
 */

import { createHash } from 'node:crypto';
import type { IntegrationProvider } from '@prisma/client';

/** Input for {@link buildIdempotencyKey}. */
export interface BuildIdempotencyKeyInput {
  /** Source provider of the trip event command. */
  provider: IntegrationProvider;
  /**
   * Stable, per-record reference from the provider (e.g. CKS:
   * `declarationNumber + lineId`, yard: `gateLogId`, GPS: `deviceId + ts`).
   */
  sourceReference: string;
  /** Time at which the event occurred at the source. Treated as UTC. */
  occurredAt: Date;
}

/**
 * Error thrown when {@link buildIdempotencyKey} receives an invalid input.
 * The `code` matches the canonical error vocabulary used across the API.
 */
export class IdempotencyKeyValidationError extends Error {
  readonly code = 'VALIDATION_ERROR' as const;

  constructor(message: string) {
    super(message);
    this.name = 'IdempotencyKeyValidationError';
  }
}

/**
 * Builds the deterministic idempotency key for an integration trip event
 * command.
 *
 * @throws {IdempotencyKeyValidationError} when `occurredAt` is not a `Date`
 *         or its time value is `NaN` (invalid date).
 */
export function buildIdempotencyKey(input: BuildIdempotencyKeyInput): string {
  const { provider, sourceReference, occurredAt } = input;

  if (!(occurredAt instanceof Date) || Number.isNaN(occurredAt.getTime())) {
    throw new IdempotencyKeyValidationError(
      'buildIdempotencyKey: `occurredAt` must be a valid Date'
    );
  }

  const occurredAtUtcSecond = Math.floor(occurredAt.getTime() / 1000);
  const canonical = `${provider}|${sourceReference}|${occurredAtUtcSecond}`;

  return createHash('sha1').update(canonical).digest('hex');
}
