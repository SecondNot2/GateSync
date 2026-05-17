/**
 * Domain event published by `TripsService` after a `TripEvent` row is
 * committed (Requirements 5.1, 5.5).
 *
 * Subscribers — most notably the upcoming `NotificationOrchestrator` — MUST
 * only observe persisted rows, so emission is wired post-`$transaction` in
 * both the AUTO SYNC `applyCommands` path and the manual / driver
 * `createEventForActor` path. Correction events are suppressed at the
 * publisher to satisfy Requirement 5.4.
 */

import type { TripEventSource, TripEventType } from '@prisma/client';

/** Event-bus topic name for `TripDomainEvent` payloads. */
export const TRIP_DOMAIN_EVENT = 'trip.domain.event' as const;

/** Logical kind of actor that produced a trip event. */
export type TripDomainEventActorKind = 'user' | 'integration' | 'system';

/** Actor metadata stamped on a domain event. */
export interface TripDomainEventActor {
  kind: TripDomainEventActorKind;
  /** User id, integration account id, or system component id (optional). */
  id?: string;
}

/**
 * Payload published on the `TRIP_DOMAIN_EVENT` topic.
 *
 * `source` reflects the domain origin of the event:
 *  - integration provider source (e.g. `CUA_KHAU_SO`, `XUAN_CUONG`, `GPS`)
 *    when produced by AUTO SYNC adapters;
 *  - `MANUAL` / `DRIVER_APP` / `IMPORT` / `SYSTEM` / `AI_ASSISTANT` for the
 *    corresponding non-sync flows.
 *
 * The orchestrator can derive the design's logical `source = 'auto_sync'`
 * label from `source ∈ { CUA_KHAU_SO, XUAN_CUONG, GPS }` together with
 * `actor.kind === 'integration'`.
 */
export interface TripDomainEvent {
  /** `TripEvent.id` of the committed row. */
  eventId: string;
  /** Tenant scope of the event. */
  organizationId: string;
  /** Trip the event belongs to. */
  tripId: string;
  /** Domain event type (Prisma enum). */
  eventType: TripEventType;
  /** Time the event happened at the source (UTC). */
  occurredAt: Date;
  /** Original `TripEventSource` recorded on the row. */
  source: TripEventSource;
  /** Actor that produced the event. */
  actor: TripDomainEventActor;
  /** True iff the event represents a correction / amendment (Requirement 5.4). */
  isCorrection: boolean;
}
