/**
 * fast-check arbitrary for `TripDomainEvent` fixtures.
 *
 * Mirrors the shape published by `TripEventService` after commit (design
 * §"Trip Event Service" + Property 11). The shape is structural and
 * deliberately decoupled from any NestJS / Prisma type so it can be reused
 * by `apps/web` integration tests, `packages/shared` unit tests and
 * orchestrator property tests alike.
 */
import * as fc from 'fast-check';

import {
  tripEventSources,
  tripEventTypes,
  type TripEventSource,
  type TripEventType
} from '../domain.js';
import { arbUuid } from './arb-uuid.js';

export interface TripDomainEventFixture {
  eventId: string;
  organizationId: string;
  tripId: string;
  eventType: TripEventType;
  occurredAt: Date;
  source: TripEventSource;
  actor: DomainActorFixture;
  isCorrection: boolean;
}

export interface DomainActorFixture {
  kind: 'user' | 'integration' | 'system';
  id?: string;
}

const arbDate = fc.date({
  min: new Date('2024-01-01T00:00:00Z'),
  max: new Date('2026-12-31T23:59:59Z'),
  noInvalidDate: true
});

const arbActor: fc.Arbitrary<DomainActorFixture> = fc.oneof(
  fc.record(
    { kind: fc.constant<'user'>('user'), id: arbUuid },
    { requiredKeys: ['kind'] }
  ) as fc.Arbitrary<DomainActorFixture>,
  fc.record(
    { kind: fc.constant<'integration'>('integration'), id: arbUuid },
    { requiredKeys: ['kind'] }
  ) as fc.Arbitrary<DomainActorFixture>,
  fc.record({ kind: fc.constant<'system'>('system') }) as fc.Arbitrary<DomainActorFixture>
);

/** All `TripDomainEvent` fields populated; `isCorrection` mixes both polarities. */
export const arbDomainEvent: fc.Arbitrary<TripDomainEventFixture> = fc.record({
  eventId: arbUuid,
  organizationId: arbUuid,
  tripId: arbUuid,
  eventType: fc.constantFrom(...tripEventTypes),
  occurredAt: arbDate,
  source: fc.constantFrom(...tripEventSources),
  actor: arbActor,
  isCorrection: fc.boolean()
});

/** Domain event with `isCorrection = true`, used by Property 13 tests. */
export const arbCorrectionDomainEvent: fc.Arbitrary<TripDomainEventFixture> = arbDomainEvent.map(
  (event) => ({ ...event, isCorrection: true })
);

/** Domain event with `isCorrection = false`, used by Property 11 tests. */
export const arbNonCorrectionDomainEvent: fc.Arbitrary<TripDomainEventFixture> = arbDomainEvent.map(
  (event) => ({ ...event, isCorrection: false })
);
