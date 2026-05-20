/**
 * RealtimeChannelPort
 *
 * Hexagonal port for the in-app realtime delivery channel used by the
 * notification orchestrator. Implementations publish a minimal message to
 * a single recipient's per-user topic so the web client can react in
 * real time without polling.
 *
 * Design references: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.7.
 *
 * Topic convention: `org:{organizationId}:user:{userId}`. Both segments must
 * match the JWT-validated identity at the subscriber side; the server-side
 * publisher is responsible for emitting the topic with the correct tenant
 * and user, never trusting client input.
 *
 * Payload contract:
 * - `deliveryId` lets the client correlate the broadcast back to a specific
 *   `Notification` row (used for mark-read, hide, RBAC re-check).
 * - `tripId` is optional because some notifications (e.g. `sync_run_failed`)
 *   are not trip-scoped.
 * - `title` / `body` are pre-rendered Vietnamese-friendly strings; sensitive
 *   fields must already be scrubbed upstream by the orchestrator.
 *
 * Result contract:
 * - `SENT` means the broadcast endpoint accepted the message. The dispatcher
 *   is then responsible for stamping `Notification.deliveredAt` — the
 *   adapter never writes to the database.
 * - `FAILED` with `transient: true` is retryable per `REALTIME_RETRY_POLICY`
 *   (1s, 3s, max 2 attempts) before the dispatcher persists `FAILED` with
 *   `failureReason = 'REALTIME_DISPATCH_FAILED'`.
 * - `FAILED` with `transient: false` indicates a permanent error
 *   (configuration missing, 4xx other than 408/429, malformed input);
 *   the orchestrator should not retry.
 */

/**
 * Minimal payload broadcast to the recipient's per-user topic.
 */
export interface RealtimeMessage {
  /** `Notification.id` — used for mark-read / hide / RBAC re-check. */
  readonly deliveryId: string;
  /** Optional trip scope; absent for non-trip notifications such as sync failures. */
  readonly tripId?: string;
  /** Notification eventType from the allowlist (e.g. `vehicle_arrived_gate`). */
  readonly eventType: string;
  /** ISO-8601 UTC timestamp of the underlying domain event. */
  readonly occurredAt: string;
  /** Pre-rendered, scrubbed Vietnamese title shown in the inbox. */
  readonly title: string;
  /** Pre-rendered, scrubbed Vietnamese body shown in the inbox. */
  readonly body: string;
}

/**
 * Outcome of a single publish attempt.
 *
 * `transient` distinguishes retryable infrastructure failures (network errors,
 * 408 / 429, 5xx) from permanent failures (missing config, 4xx). The
 * dispatcher uses this flag to honour `REALTIME_RETRY_POLICY` (1s, 3s, max 2
 * retries) before marking the delivery as `FAILED`.
 */
export type PublishResult =
  | { readonly status: 'SENT' }
  | { readonly status: 'FAILED'; readonly reason: string; readonly transient: boolean };

/**
 * Realtime publishing port. Implementations MUST NOT mutate the database;
 * persisting `deliveredAt` or `FAILED` status belongs to the dispatcher.
 */
export interface RealtimeChannelPort {
  /**
   * Publish `message` to the topic `org:{organizationId}:user:{userId}`.
   */
  publishToUser(
    organizationId: string,
    userId: string,
    message: RealtimeMessage
  ): Promise<PublishResult>;
}

/**
 * DI token for the `RealtimeChannelPort`. Use `Symbol.for(...)` so the same
 * symbol resolves across module boundaries (e.g. test doubles and the
 * production adapter both register against this token).
 */
export const REALTIME_CHANNEL_PORT = Symbol.for('gatesync.notifications.realtimeChannel');

/**
 * Retry policy for transient realtime failures, per Requirement 8.7.
 *
 * - `delaysMs`: backoff schedule for attempts after the initial publish.
 *   The dispatcher waits `delaysMs[0]` before retry 1 and `delaysMs[1]`
 *   before retry 2.
 * - `maxAttempts`: total executions including the initial attempt
 *   (1 initial + up to 2 retries = 3 max).
 */
export const REALTIME_RETRY_POLICY = Object.freeze({
  delaysMs: Object.freeze([1_000, 3_000] as const),
  maxAttempts: 3
});
