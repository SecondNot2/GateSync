/**
 * Notification eventType allowlist and trip event → notification eventType mapper.
 *
 * Per design (Property 12, Requirements 5.2, 5.3) the orchestrator must
 * short-circuit to zero deliveries when an inbound domain event does not map
 * to one of the supported notification eventTypes. Keeping the union, the
 * runtime allowlist, and the mapper colocated lets the orchestrator and the
 * notification rule CRUD share a single source of truth.
 */

/**
 * Allowed notification eventType values.
 *
 * NOTE: keep this list in sync with `NOTIFICATION_EVENT_TYPES` below — the
 * union is the type-level mirror of the runtime allowlist.
 */
export type NotificationEventType =
  | 'trip_status_changed'
  | 'vehicle_arrived_gate'
  | 'vehicle_left_gate'
  | 'declaration_rejected'
  | 'fee_pending'
  | 'delay_threshold_exceeded'
  // System-generated event emitted by `SyncWorker` when an
  // `IntegrationSyncRun` transitions to `FAILED` (Requirements 3.4, 3.5).
  // Not produced from a `NotificationRule` row — the orchestrator
  // synthesises a mandatory `[IN_APP, EMAIL]` rule for org admins.
  // `mapTripEventToNotificationEventType` deliberately never maps a
  // trip event to this value.
  | 'sync_run_failed';

/**
 * Runtime allowlist of supported notification eventTypes.
 *
 * Used by:
 * - `NotificationOrchestrator` to filter inbound domain events.
 * - `NotificationRule` Zod schema to validate admin-created rules.
 */
export const NOTIFICATION_EVENT_TYPES: readonly NotificationEventType[] = [
  'trip_status_changed',
  'vehicle_arrived_gate',
  'vehicle_left_gate',
  'declaration_rejected',
  'fee_pending',
  'delay_threshold_exceeded',
  'sync_run_failed'
] as const;

/**
 * Type guard: returns true when `value` is a supported notification eventType.
 */
export function isNotificationEventType(value: unknown): value is NotificationEventType {
  return (
    typeof value === 'string' && (NOTIFICATION_EVENT_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Derived flags computed by the trip event service after applying a command.
 *
 * `tripStatusChanged` is true when the just-committed `TripEvent` advanced
 * `Trip.currentStatus`. The orchestrator passes this so the mapper can emit
 * `trip_status_changed` for events whose specific `tripEventType` does not
 * have a dedicated notification eventType but still moved the trip status.
 */
export interface TripEventDerivedFlags {
  tripStatusChanged?: boolean;
}

/**
 * Direct trip event type → notification event type mapping.
 *
 * Sourced from design §"Filter eventType vs allowlist":
 * - `vehicle_arrived_gate` ← `ARRIVED_BORDER_AREA`, `YARD_ENTRY_CONFIRMED`
 * - `vehicle_left_gate`    ← `YARD_EXIT_CONFIRMED`, `BORDER_GATE_EXIT_CONFIRMED`, `VEHICLE_RELEASED`
 * - `declaration_rejected` ← `DECLARATION_REJECTED`
 * - `fee_pending`          ← `FEE_PENDING_FLAGGED`
 * - `delay_threshold_exceeded` ← `DELAY_THRESHOLD_EXCEEDED`
 *
 * `trip_status_changed` is intentionally not in this table — it is derived
 * from `TripEventDerivedFlags.tripStatusChanged` rather than from the trip
 * event type alone.
 */
const TRIP_EVENT_TYPE_TO_NOTIFICATION: Readonly<Record<string, NotificationEventType>> = {
  ARRIVED_BORDER_AREA: 'vehicle_arrived_gate',
  YARD_ENTRY_CONFIRMED: 'vehicle_arrived_gate',
  YARD_EXIT_CONFIRMED: 'vehicle_left_gate',
  BORDER_GATE_EXIT_CONFIRMED: 'vehicle_left_gate',
  VEHICLE_RELEASED: 'vehicle_left_gate',
  DECLARATION_REJECTED: 'declaration_rejected',
  FEE_PENDING_FLAGGED: 'fee_pending',
  DELAY_THRESHOLD_EXCEEDED: 'delay_threshold_exceeded'
};

/**
 * Map a `TripEvent.eventType` (plus derived flags) to a notification
 * eventType in the allowlist, or `null` when the event should not produce a
 * notification.
 *
 * Resolution order:
 * 1. If the trip event type has a dedicated notification eventType, return it.
 * 2. Otherwise, if `derivedFlags.tripStatusChanged === true`, return
 *    `'trip_status_changed'`.
 * 3. Otherwise, return `null` so the orchestrator can short-circuit
 *    (Property 12 / Requirements 5.2, 5.3).
 *
 * Direct mappings take priority over the status-changed fallback so an event
 * like `YARD_EXIT_CONFIRMED` that also advances trip status fires the more
 * specific `vehicle_left_gate` notification rather than the generic one.
 */
export function mapTripEventToNotificationEventType(
  tripEventType: string,
  derivedFlags?: TripEventDerivedFlags
): NotificationEventType | null {
  const direct = TRIP_EVENT_TYPE_TO_NOTIFICATION[tripEventType];
  if (direct !== undefined) {
    return direct;
  }
  if (derivedFlags?.tripStatusChanged === true) {
    return 'trip_status_changed';
  }
  return null;
}
