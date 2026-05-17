/**
 * Domain event published by `SyncWorkerService` after an
 * `IntegrationSyncRun` row transitions to `FAILED` (Requirements 3.4, 3.5).
 *
 * Subscribers — most notably `NotificationOrchestrator` — fan out an
 * implicit, mandatory `sync_run_failed` notification (channels
 * `[IN_APP, EMAIL]`) to every organization admin (`OWNER` + `ADMIN`) of
 * the integration account's organization. The event payload carries the
 * already-scrubbed error message and a stable `errorCode` so the
 * orchestrator never reaches back into provider state to render its body.
 *
 * NOTE: this is intentionally a different topic from `TRIP_DOMAIN_EVENT`
 * so trip-event subscribers do not have to filter sync-failure payloads
 * out, and so the orchestrator can branch without an `actor.kind` check.
 */

import type { IntegrationProvider } from '@prisma/client';

/** Event-bus topic name for `SyncRunFailedEvent` payloads. */
export const SYNC_RUN_FAILED_EVENT = 'integration.sync_run_failed' as const;

/**
 * Payload published on the `SYNC_RUN_FAILED_EVENT` topic.
 *
 * `errorMessage` MUST be passed through `defaultSensitiveScrubber` by the
 * publisher before emission; the orchestrator does not re-scrub. Keeping
 * scrubbing at the source avoids leaking raw provider strings onto the
 * event bus, where any future subscriber could observe them.
 */
export interface SyncRunFailedEvent {
  /** `IntegrationSyncRun.id` of the failed run. */
  syncRunId: string;
  /** Tenant scope of the sync run. */
  organizationId: string;
  /** `IntegrationAccount.id` whose run failed. */
  integrationAccountId: string;
  /** Provider that produced the failure. */
  provider: IntegrationProvider;
  /** Time the run transitioned to `FAILED` (UTC). */
  failedAt: Date;
  /** Stable error code (e.g. `INTEGRATION_FAILED`, `INTERNAL_ERROR`). */
  errorCode: string;
  /** Already-scrubbed error message, safe to render in notification UI. */
  errorMessage: string;
}
