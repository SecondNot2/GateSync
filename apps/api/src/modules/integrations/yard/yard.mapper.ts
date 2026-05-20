import { Injectable } from '@nestjs/common';
import {
  IntegrationProvider,
  TripEventSource,
  TripEventType,
  type IntegrationAccount,
  type Prisma
} from '@prisma/client';
import { buildIdempotencyKey } from '../idempotency-key';

import type {
  AdapterContext,
  MapResult,
  ProviderAdapter,
  RejectionReason,
  SyncCursor
} from '../adapters/provider-adapter';

/**
 * Payload produced by yard provider integrations (gate-log feeds for yard
 * entry/exit confirmations).
 *
 * Per design.md §"Idempotency key format":
 *   `sourceReference = gateLogId` for yard providers.
 *
 * `gateLogId` is the stable per-record identifier emitted by the yard system
 * for a single gate scan; it is unique within the provider and is therefore a
 * sufficient seed for {@link buildIdempotencyKey} together with the provider
 * name and `occurredAt`.
 */
export interface YardPayload {
  /** Stable yard-side identifier of the gate log entry (UUID-like). */
  gateLogId: string;
  /**
   * Trip the yard event belongs to. Required to emit a `TripEventCommand`;
   * missing → `MISSING_REQUIRED_FIELD` reject (Requirement 2.5).
   */
  tripId?: string;
  /**
   * Optional plate read by the yard gate device. Captured into the
   * normalized payload for audit / cross-checking; the mapper never invents
   * one.
   */
  vehiclePlate?: string;
  /** Direction reported by the yard gate. */
  eventKind: 'ENTRY' | 'EXIT';
  /**
   * ISO-8601 / RFC-3339 timestamp at which the gate scan happened.
   * Parsed via `new Date()`; non-finite values are rejected.
   */
  occurredAt: string;
}

/**
 * Yard provider adapter (Xuân Cường gate-log feed).
 *
 * Pure, stateless mapper that normalizes yard gate-log payloads into
 * `TripEventCommand`s consumed by `Trip_Event_Service`.
 *
 * The Prisma `IntegrationProvider` enum models the yard integration as
 * {@link IntegrationProvider.XUAN_CUONG} (the existing Xuân Cường yard
 * provider value); there is no separate `YARD` enum value, so this adapter
 * deliberately uses `XUAN_CUONG` for both its `provider` discriminant and
 * the emitted `TripEventSource`.
 *
 * Validates: Requirements 2.1, 2.2, 2.5
 */
@Injectable()
export class YardMapper implements ProviderAdapter<YardPayload> {
  // Yard integration is stored as `XUAN_CUONG` in the Prisma enum
  // (no dedicated `YARD` value). See comment on the class above.
  readonly provider: IntegrationProvider = IntegrationProvider.XUAN_CUONG;

  /**
   * Pull pending yard gate-log entries for `account`.
   *
   * TODO(realtime-sync-notifications #4.5): integrate with the real yard HTTP
   * API (auth, paging, cursor persistence). For now this is a deliberate stub
   * that yields nothing so the worker can wire the adapter end-to-end without
   * depending on an external service.
   */
  // eslint-disable-next-line require-yield
  async *fetch(_account: IntegrationAccount, _cursor: SyncCursor): AsyncIterable<YardPayload> {
    // Intentionally empty until the yard provider integration lands.
    return;
  }

  map(payload: YardPayload, ctx: AdapterContext): MapResult {
    const sourceReference = this.buildSourceReference(payload);

    const gateLogId = this.requireNonEmptyString(payload?.gateLogId);
    if (!gateLogId) {
      return this.reject(sourceReference, {
        code: 'MISSING_REQUIRED_FIELD',
        field: 'gateLogId',
        message: 'Yard payload is missing `gateLogId`.'
      });
    }

    const tripId = this.requireNonEmptyString(payload?.tripId);
    if (!tripId) {
      // TripEventCommand requires a resolved tripId; per the adapter contract
      // we reject rather than fabricate one (Requirement 2.5).
      return this.reject(sourceReference, {
        code: 'MISSING_REQUIRED_FIELD',
        field: 'tripId',
        message: 'Yard payload cannot be mapped without `tripId`.'
      });
    }

    const eventKind = this.parseEventKind(payload?.eventKind);
    if (!eventKind) {
      return this.reject(sourceReference, {
        code: 'MISSING_REQUIRED_FIELD',
        field: 'eventKind',
        message: 'Yard payload `eventKind` is missing or not one of `ENTRY` | `EXIT`.'
      });
    }

    const occurredAt = this.parseTimestamp(payload?.occurredAt);
    if (!occurredAt) {
      return this.reject(sourceReference, {
        code: 'INVALID_OCCURRED_AT',
        field: 'occurredAt',
        message: 'Yard payload `occurredAt` is missing or not a valid timestamp.'
      });
    }

    const eventType =
      eventKind === 'ENTRY'
        ? TripEventType.YARD_ENTRY_CONFIRMED
        : TripEventType.YARD_EXIT_CONFIRMED;

    const idempotencyKey = buildIdempotencyKey({
      provider: this.provider,
      sourceReference: gateLogId,
      occurredAt
    });

    const normalizedPayload = this.buildNormalizedPayload({
      gateLogId,
      eventKind,
      occurredAt,
      vehiclePlate: this.requireNonEmptyString(payload?.vehiclePlate)
    });

    return {
      kind: 'event',
      command: {
        // Property 3 / Requirement 2.1 — tenant scope is taken from ctx,
        // never from the untrusted payload.
        organizationId: ctx.organizationId,
        tripId,
        eventType,
        // Yard events flow under the Xuân Cường source bucket; there is no
        // dedicated `YARD` value in the `TripEventSource` Prisma enum.
        source: TripEventSource.XUAN_CUONG,
        sourceRef: gateLogId,
        idempotencyKey,
        occurredAt,
        payload: normalizedPayload,
        actor: { kind: 'integration', id: ctx.integrationAccountId }
      }
    };
  }

  private buildSourceReference(payload: YardPayload | null | undefined): string {
    return typeof payload?.gateLogId === 'string' && payload.gateLogId.trim().length > 0
      ? payload.gateLogId.trim()
      : 'unknown';
  }

  private parseEventKind(value: unknown): 'ENTRY' | 'EXIT' | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim().toUpperCase();
    return trimmed === 'ENTRY' || trimmed === 'EXIT' ? trimmed : undefined;
  }

  private parseTimestamp(value: unknown): Date | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private requireNonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private buildNormalizedPayload(input: {
    gateLogId: string;
    eventKind: 'ENTRY' | 'EXIT';
    occurredAt: Date;
    vehiclePlate: string | undefined;
  }): Prisma.InputJsonValue {
    const payload: Record<string, unknown> = {
      gateLogId: input.gateLogId,
      eventKind: input.eventKind,
      occurredAt: input.occurredAt.toISOString()
    };

    if (input.vehiclePlate) {
      payload.vehiclePlate = input.vehiclePlate;
    }

    return payload as Prisma.InputJsonValue;
  }

  private reject(sourceReference: string, reason: RejectionReason): MapResult {
    return { kind: 'reject', sourceReference, reason };
  }
}
