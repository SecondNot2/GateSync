/**
 * Mock provider adapter for development and demos.
 *
 * Emits a deterministic stream of canonical demo scenarios that exercise the
 * AUTO SYNC pipeline end-to-end without depending on a real external system.
 * The generator covers the four scenarios called out in the integration rules:
 *
 *   1. Status flow      — happy-path trip from creation to completion.
 *   2. Rejected declaration — declaration submitted then rejected by customs.
 *   3. Fee pending      — declaration approved, customs processing stalled
 *                         awaiting fee payment.
 *   4. Delayed vehicle  — vehicle waiting at yard entry past the SLA, used
 *                         by the delay-threshold notifications.
 *
 * Determinism is critical so that demos and integration tests yield the
 * same `Idempotency_Key`s on every replay (Property 5 / Requirement 3.6).
 * Payload timestamps are anchored to a fixed UTC base so retried runs build
 * identical keys.
 *
 * Validates: Requirements 2.1, 2.2, 2.5
 * Cross-ref: design.md §"Provider Adapter (Mapper)" + steering rule
 *            "07-integrations.md → Mock adapters".
 */

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
 * Payload shape produced by {@link MockMapper.fetch}.
 *
 * Required fields enforce the same minimum contract as real provider payloads
 * so tests can re-use the rejection paths in {@link MockMapper.map}.
 */
export interface MockPayload {
  /** Stable per-record reference, unique within the mock provider. */
  sourceReference: string;
  /** When the mock event "happened" at the source (UTC). */
  occurredAt: Date;
  /** Trip the event belongs to. Adapters must not invent this value. */
  tripId: string;
  /** Domain event type for the emitted command. */
  eventType: TripEventType;
  /** Optional normalized payload retained on the trip event. */
  payload?: Prisma.InputJsonValue;
}

/** Identifier for one of the canonical demo scenarios produced by the mock adapter. */
export type MockScenarioId =
  | 'status-flow'
  | 'rejected-declaration'
  | 'fee-pending'
  | 'delayed-vehicle';

/**
 * Anchor timestamp for every mock event. Choosing a fixed instant keeps
 * `sha1(provider|sourceReference|occurredAtUtcSecond)` stable across runs.
 *
 * 2024-06-01T00:00:00Z was chosen as a non-DST UTC midnight in a calendar
 * year well after the AUTO SYNC schema migrations land.
 */
const MOCK_BASE_TIME_UTC = Date.UTC(2024, 5, 1, 0, 0, 0);

/** Step in a deterministic scripted scenario. */
interface MockScriptedStep {
  /** Trip this step belongs to. Distinct per scenario. */
  tripId: string;
  /** Domain event type emitted by the step. */
  eventType: TripEventType;
  /** Offset from {@link MOCK_BASE_TIME_UTC} in seconds. Strictly increasing. */
  offsetSeconds: number;
  /** Stable suffix used in the source reference. Must be unique per scenario. */
  ref: string;
  /** Optional descriptive payload retained on the event. */
  payload?: Record<string, unknown>;
}

/**
 * Canonical demo scripts, one per scenario. The arrays are deliberately
 * frozen so consumers (and tests) cannot mutate the deterministic schedule.
 */
const MOCK_SCENARIOS: ReadonlyArray<{
  readonly id: MockScenarioId;
  readonly steps: ReadonlyArray<MockScriptedStep>;
}> = Object.freeze([
  {
    id: 'status-flow',
    steps: Object.freeze([
      {
        tripId: 'mock-trip-status-flow',
        eventType: TripEventType.TRIP_CREATED,
        offsetSeconds: 0,
        ref: 'created',
        payload: { scenario: 'status-flow', step: 'trip-created' }
      },
      {
        tripId: 'mock-trip-status-flow',
        eventType: TripEventType.DEPARTED,
        offsetSeconds: 600,
        ref: 'departed',
        payload: { scenario: 'status-flow', step: 'departed' }
      },
      {
        tripId: 'mock-trip-status-flow',
        eventType: TripEventType.BORDER_GATE_ENTRY_CONFIRMED,
        offsetSeconds: 3600,
        ref: 'border-entry',
        payload: { scenario: 'status-flow', step: 'border-entry' }
      },
      {
        tripId: 'mock-trip-status-flow',
        eventType: TripEventType.YARD_ENTRY_CONFIRMED,
        offsetSeconds: 4500,
        ref: 'yard-entry',
        payload: { scenario: 'status-flow', step: 'yard-entry' }
      },
      {
        tripId: 'mock-trip-status-flow',
        eventType: TripEventType.CUSTOMS_PROCESSING,
        offsetSeconds: 5400,
        ref: 'customs',
        payload: { scenario: 'status-flow', step: 'customs-processing' }
      },
      {
        tripId: 'mock-trip-status-flow',
        eventType: TripEventType.FEE_PAID,
        offsetSeconds: 7200,
        ref: 'fee-paid',
        payload: { scenario: 'status-flow', step: 'fee-paid', amount: 500_000 }
      },
      {
        tripId: 'mock-trip-status-flow',
        eventType: TripEventType.BORDER_GATE_EXIT_CONFIRMED,
        offsetSeconds: 9000,
        ref: 'border-exit',
        payload: { scenario: 'status-flow', step: 'border-exit' }
      },
      {
        tripId: 'mock-trip-status-flow',
        eventType: TripEventType.TRIP_COMPLETED,
        offsetSeconds: 9600,
        ref: 'completed',
        payload: { scenario: 'status-flow', step: 'completed' }
      }
    ] as const satisfies ReadonlyArray<MockScriptedStep>)
  },
  {
    id: 'rejected-declaration',
    steps: Object.freeze([
      {
        tripId: 'mock-trip-rejected-declaration',
        eventType: TripEventType.DECLARATION_SUBMITTED,
        offsetSeconds: 0,
        ref: 'submitted',
        payload: {
          scenario: 'rejected-declaration',
          step: 'declaration-submitted',
          declarationNumber: 'MOCK-DECL-REJECT-0001'
        }
      },
      {
        tripId: 'mock-trip-rejected-declaration',
        eventType: TripEventType.DECLARATION_REJECTED,
        offsetSeconds: 1800,
        ref: 'rejected',
        payload: {
          scenario: 'rejected-declaration',
          step: 'declaration-rejected',
          declarationNumber: 'MOCK-DECL-REJECT-0001',
          reason: 'Hồ sơ thiếu chứng từ vận tải.'
        }
      }
    ] as const satisfies ReadonlyArray<MockScriptedStep>)
  },
  {
    id: 'fee-pending',
    steps: Object.freeze([
      {
        tripId: 'mock-trip-fee-pending',
        eventType: TripEventType.DECLARATION_APPROVED,
        offsetSeconds: 0,
        ref: 'approved',
        payload: {
          scenario: 'fee-pending',
          step: 'declaration-approved',
          declarationNumber: 'MOCK-DECL-FEE-0001'
        }
      },
      {
        tripId: 'mock-trip-fee-pending',
        eventType: TripEventType.CUSTOMS_PROCESSING,
        offsetSeconds: 600,
        ref: 'awaiting-fee',
        payload: {
          scenario: 'fee-pending',
          step: 'awaiting-fee',
          feeStatus: 'PENDING',
          amount: 750_000
        }
      }
    ] as const satisfies ReadonlyArray<MockScriptedStep>)
  },
  {
    id: 'delayed-vehicle',
    steps: Object.freeze([
      {
        tripId: 'mock-trip-delayed-vehicle',
        eventType: TripEventType.ARRIVED_BORDER_AREA,
        offsetSeconds: 0,
        ref: 'arrived',
        payload: { scenario: 'delayed-vehicle', step: 'arrived-border-area' }
      },
      {
        tripId: 'mock-trip-delayed-vehicle',
        eventType: TripEventType.WAITING_YARD_ENTRY,
        offsetSeconds: 600,
        ref: 'waiting',
        payload: {
          scenario: 'delayed-vehicle',
          step: 'waiting-yard-entry',
          slaMinutes: 30
        }
      },
      {
        tripId: 'mock-trip-delayed-vehicle',
        eventType: TripEventType.WAITING_YARD_ENTRY,
        offsetSeconds: 7200,
        ref: 'still-waiting',
        payload: {
          scenario: 'delayed-vehicle',
          step: 'still-waiting',
          slaMinutes: 30,
          waitedMinutes: 110
        }
      }
    ] as const satisfies ReadonlyArray<MockScriptedStep>)
  }
] as const);

/**
 * Mock provider adapter.
 *
 * Pure, stateless mapper that produces a deterministic stream of demo
 * scenarios. Every retry attempt with the same `attemptGroupId` will produce
 * the same set of {@link MockPayload}s and therefore the same set of
 * `Idempotency_Key`s (Requirement 3.6).
 */
@Injectable()
export class MockMapper implements ProviderAdapter<MockPayload> {
  readonly provider: IntegrationProvider = IntegrationProvider.MOCK;

  /**
   * Yield the canonical demo scenarios in deterministic order.
   *
   * `cursor.lastObservedAt`, when supplied, is honoured so the worker can
   * drive the adapter in incremental mode (e.g. integration tests that want
   * to observe only payloads strictly newer than a previous run).
   */
  async *fetch(_account: IntegrationAccount, cursor: SyncCursor): AsyncIterable<MockPayload> {
    const lastObservedMs =
      cursor.lastObservedAt instanceof Date && !Number.isNaN(cursor.lastObservedAt.getTime())
        ? cursor.lastObservedAt.getTime()
        : Number.NEGATIVE_INFINITY;

    for (const scenario of MOCK_SCENARIOS) {
      for (const step of scenario.steps) {
        const occurredAt = new Date(MOCK_BASE_TIME_UTC + step.offsetSeconds * 1000);

        if (occurredAt.getTime() <= lastObservedMs) {
          continue;
        }

        const yielded: MockPayload = {
          sourceReference: `mock:${scenario.id}:${step.ref}`,
          occurredAt,
          tripId: step.tripId,
          eventType: step.eventType
        };

        if (step.payload) {
          yielded.payload = {
            ...step.payload,
            scenario: scenario.id
          } as Prisma.InputJsonValue;
        }

        yield yielded;
      }
    }
  }

  map(payload: MockPayload, ctx: AdapterContext): MapResult {
    const sourceReference = this.resolveSourceReference(payload);

    const occurredAt = this.requireValidDate(payload?.occurredAt);
    if (!occurredAt) {
      return this.reject(sourceReference, {
        code: 'INVALID_OCCURRED_AT',
        field: 'occurredAt',
        message: 'Mock payload `occurredAt` is missing or not a valid Date.'
      });
    }

    const sourceRef = this.requireNonEmptyString(payload?.sourceReference);
    if (!sourceRef) {
      return this.reject(sourceReference, {
        code: 'MISSING_REQUIRED_FIELD',
        field: 'sourceReference',
        message: 'Mock payload is missing `sourceReference`.'
      });
    }

    const tripId = this.requireNonEmptyString(payload?.tripId);
    if (!tripId) {
      return this.reject(sourceReference, {
        code: 'MISSING_REQUIRED_FIELD',
        field: 'tripId',
        message: 'Mock payload is missing `tripId`.'
      });
    }

    const eventType = this.requireNonEmptyString(payload?.eventType);
    if (!eventType) {
      return this.reject(sourceReference, {
        code: 'MISSING_REQUIRED_FIELD',
        field: 'eventType',
        message: 'Mock payload is missing `eventType`.'
      });
    }

    const idempotencyKey = buildIdempotencyKey({
      provider: this.provider,
      sourceReference: sourceRef,
      occurredAt
    });

    return {
      kind: 'event',
      command: {
        // Property 3 / Requirement 2.1 — tenant scope is taken from ctx,
        // never from the untrusted payload.
        organizationId: ctx.organizationId,
        tripId,
        eventType: payload.eventType,
        source: TripEventSource.SYSTEM,
        sourceRef,
        idempotencyKey,
        occurredAt,
        ...(payload.payload !== undefined ? { payload: payload.payload } : {}),
        actor: { kind: 'integration', id: ctx.integrationAccountId }
      }
    };
  }

  private resolveSourceReference(payload: MockPayload | null | undefined): string {
    const candidate =
      typeof payload?.sourceReference === 'string' && payload.sourceReference.trim().length > 0
        ? payload.sourceReference.trim()
        : 'unknown';
    return candidate;
  }

  private requireNonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private requireValidDate(value: unknown): Date | undefined {
    return value instanceof Date && !Number.isNaN(value.getTime()) ? value : undefined;
  }

  private reject(sourceReference: string, reason: RejectionReason): MapResult {
    return { kind: 'reject', sourceReference, reason };
  }
}
