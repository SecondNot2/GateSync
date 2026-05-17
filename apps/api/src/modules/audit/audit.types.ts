/**
 * Public types for the AuditService.
 *
 * Design references:
 * - Requirements: 4.8, 6.7, 16.1, 16.2, 16.3
 * - `AuditLog` Prisma model (`packages/database/prisma/schema.prisma`)
 *
 * `entityType` is a free-text string. Canonical values used across the codebase
 * include (non-exhaustive): `INTEGRATION_ACCOUNT`, `NOTIFICATION_RULE`,
 * `INTEGRATION_DEBUG_MODE`, `TRIP`, `TRIP_EVENT`, `VEHICLE`, `DRIVER`,
 * `MEMBERSHIP`, `MEMBERSHIP_INVITATION`, `ORGANIZATION`. Callers must pass
 * canonical values — there is no DB-level enum.
 */

export type AuditActorKind = 'user' | 'system' | 'integration';

/**
 * Identifies who/what initiated the audited change.
 *
 * - `kind = 'user'`: a real authenticated end-user. `id` should be the
 *   application user UUID and is persisted on `AuditLog.actorUserId`.
 * - `kind = 'system'`: an internal background job, scheduler, or migration.
 *   `id` is optional and is NOT persisted on `actorUserId`.
 * - `kind = 'integration'`: an external provider sync run. `id` is optional
 *   (e.g. `IntegrationAccount.id`) and is NOT persisted on `actorUserId`.
 */
export interface AuditActor {
  readonly kind: AuditActorKind;
  readonly id?: string;
}

/**
 * Canonical action verbs are dot-namespaced and lower-cased, e.g.
 * `integration_account.update`, `notification_rule.create`,
 * `trip_event.correct`. The audit service does not validate the string;
 * callers are responsible for using a stable vocabulary.
 */
export type AuditAction = string;

/**
 * Well-known entity types referenced by this feature. Callers MAY pass other
 * canonical strings; this union is documentation, not validation.
 */
export type AuditEntityType =
  | 'INTEGRATION_ACCOUNT'
  | 'NOTIFICATION_RULE'
  | 'INTEGRATION_DEBUG_MODE'
  | 'TRIP'
  | 'TRIP_EVENT'
  | 'VEHICLE'
  | 'DRIVER'
  | 'MEMBERSHIP'
  | 'MEMBERSHIP_INVITATION'
  | 'ORGANIZATION'
  | (string & Record<never, never>);

/**
 * Input contract for {@link AuditService.record}.
 *
 * `before` and `after` may be any JSON-compatible structure (Prisma rows,
 * plain DTOs, etc). The service will:
 *   1. Reduce any `customUserIds: string[]` to `{ count, ids }` summaries.
 *   2. Run the result through the `SensitiveScrubber` from
 *      `@gatesync/shared`, which masks credentials, phone numbers, emails,
 *      vehicle plates, and other sensitive substrings.
 */
export interface AuditRecordInput {
  readonly action: AuditAction;
  readonly entityType: AuditEntityType;
  readonly entityId?: string | null;
  readonly organizationId?: string | null;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly actor: AuditActor;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
}
