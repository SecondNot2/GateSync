/**
 * fast-check arbitrary for `TripEventCommand` fixtures.
 *
 * The `TripEventCommand` type is defined inline here as a structural shape
 * the shared package can use without importing from `apps/api`. When task
 * 3.1 lands the canonical type in `apps/api/src/modules/integrations/...`,
 * `TripEventCommandFixture` should remain a structural subset compatible
 * with it.
 */
import * as fc from 'fast-check';

import {
  tripEventTypes,
  type TripEventSource,
  type TripEventType,
  integrationProviders,
  type IntegrationProvider
} from '../domain.js';
import { arbUuid } from './arb-uuid.js';

export interface TripEventCommandFixture {
  organizationId: string;
  tripId: string;
  eventType: TripEventType;
  occurredAt: Date;
  source: TripEventSource;
  provider?: IntegrationProvider;
  sourceReference?: string;
  idempotencyKey: string;
  actor: ActorFixture;
  payload?: Record<string, unknown>;
  isCorrection?: boolean;
}

export interface ActorFixture {
  kind: 'user' | 'integration' | 'system';
  id?: string;
}

const arbDate = fc.date({
  min: new Date('2024-01-01T00:00:00Z'),
  max: new Date('2026-12-31T23:59:59Z'),
  noInvalidDate: true
});

const arbActor: fc.Arbitrary<ActorFixture> = fc.oneof(
  fc.record(
    { kind: fc.constant<'user'>('user'), id: arbUuid },
    { requiredKeys: ['kind'] }
  ) as fc.Arbitrary<ActorFixture>,
  fc.record(
    { kind: fc.constant<'integration'>('integration'), id: arbUuid },
    { requiredKeys: ['kind'] }
  ) as fc.Arbitrary<ActorFixture>,
  fc.record({ kind: fc.constant<'system'>('system') }) as fc.Arbitrary<ActorFixture>
);

const arbIdempotencyKey = fc
  .array(
    fc.integer({ min: 0, max: 15 }).map((n) => '0123456789abcdef'.charAt(n)),
    { minLength: 40, maxLength: 40 }
  )
  .map((chars) => chars.join(''));

const arbIntegrationSource: fc.Arbitrary<TripEventSource> = fc.constantFrom(
  'CUA_KHAU_SO',
  'XUAN_CUONG',
  'GPS',
  'IMPORT'
) as fc.Arbitrary<TripEventSource>;

const arbManualSource: fc.Arbitrary<TripEventSource> = fc.constantFrom(
  'MANUAL',
  'DRIVER_APP',
  'SYSTEM',
  'AI_ASSISTANT'
) as fc.Arbitrary<TripEventSource>;

const arbPayload: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 16 }),
  fc.jsonValue() as fc.Arbitrary<unknown>,
  { maxKeys: 6 }
) as fc.Arbitrary<Record<string, unknown>>;

/**
 * Trip event command tied to an integration source (CKS / yard / GPS / mock).
 * `provider`, `sourceReference` and `idempotencyKey` are populated.
 */
export const arbIntegrationTripEventCommand: fc.Arbitrary<TripEventCommandFixture> = fc.record(
  {
    organizationId: arbUuid,
    tripId: arbUuid,
    eventType: fc.constantFrom(...tripEventTypes),
    occurredAt: arbDate,
    source: arbIntegrationSource,
    provider: fc.constantFrom(...integrationProviders),
    sourceReference: fc.string({ minLength: 4, maxLength: 64 }),
    idempotencyKey: arbIdempotencyKey,
    actor: arbActor,
    payload: arbPayload,
    isCorrection: fc.boolean()
  },
  {
    requiredKeys: [
      'organizationId',
      'tripId',
      'eventType',
      'occurredAt',
      'source',
      'idempotencyKey',
      'actor'
    ]
  }
) as fc.Arbitrary<TripEventCommandFixture>;

/**
 * Manual / driver-app / system trip event command (no integration provider).
 */
export const arbManualTripEventCommand: fc.Arbitrary<TripEventCommandFixture> = fc.record(
  {
    organizationId: arbUuid,
    tripId: arbUuid,
    eventType: fc.constantFrom(...tripEventTypes),
    occurredAt: arbDate,
    source: arbManualSource,
    idempotencyKey: arbIdempotencyKey,
    actor: arbActor,
    payload: arbPayload,
    isCorrection: fc.boolean()
  },
  {
    requiredKeys: [
      'organizationId',
      'tripId',
      'eventType',
      'occurredAt',
      'source',
      'idempotencyKey',
      'actor'
    ]
  }
) as fc.Arbitrary<TripEventCommandFixture>;

/** Mixed integration + manual command arbitrary. */
export const arbTripEventCommand: fc.Arbitrary<TripEventCommandFixture> = fc.oneof(
  { weight: 3, arbitrary: arbIntegrationTripEventCommand },
  { weight: 1, arbitrary: arbManualTripEventCommand }
);

/**
 * Batch of trip event commands sharing the same `organizationId`. Useful for
 * testing the `TripEventService.applyCommand` idempotency invariant
 * (Property 2): when duplicate commands appear, eventsCreated + eventsSkipped
 * should equal recordsFetched.
 */
export const arbTripEventCommandBatch: fc.Arbitrary<TripEventCommandFixture[]> = fc
  .tuple(arbUuid, fc.array(arbTripEventCommand, { minLength: 1, maxLength: 16 }))
  .map(([orgId, commands]) => commands.map((cmd) => ({ ...cmd, organizationId: orgId })));

/**
 * Batch with intentional duplicates — every command is repeated 1–3 times so
 * idempotency invariants can be exercised under replay.
 */
export const arbTripEventCommandBatchWithDuplicates: fc.Arbitrary<TripEventCommandFixture[]> = fc
  .tuple(
    arbUuid,
    fc.array(arbTripEventCommand, { minLength: 1, maxLength: 8 }).chain((commands) =>
      fc
        .array(fc.integer({ min: 1, max: 3 }), {
          minLength: commands.length,
          maxLength: commands.length
        })
        .map((repeats) =>
          commands.flatMap((cmd, i) => Array.from({ length: repeats[i] ?? 1 }, () => ({ ...cmd })))
        )
    )
  )
  .map(([orgId, commands]) => commands.map((cmd) => ({ ...cmd, organizationId: orgId })));
