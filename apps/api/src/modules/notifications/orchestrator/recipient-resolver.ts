import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MembershipRole, NotificationRule } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { TripDomainEvent } from '../../trips/trip-domain-event';

/**
 * Output of {@link RecipientResolver.resolveRecipients}.
 *
 * Carried through the orchestrator pipeline (de-dup, preference filter,
 * RBAC) before any `Notification` row is inserted. `role` is the membership
 * role observed for the user at `event.occurredAt` and is used by downstream
 * RBAC checks (e.g. "can this user view the trip?"). It is intentionally
 * optional because not every recipient — most notably an `assigned_driver`
 * who may not be an organization member — has a membership row to read.
 */
export interface RecipientResolution {
  userId: string;
  organizationId: string;
  /** Membership role at event.occurredAt for downstream policy checks. */
  role?: string;
}

/** Roles considered admins for the `organization_admins` recipient scope. */
const ADMIN_ROLES: readonly MembershipRole[] = ['OWNER', 'ADMIN'];

/**
 * Roles considered operators for the `organization_operators` recipient
 * scope. Mirrors design §"Resolve recipients per rule": dispatchers,
 * field operators, and document staff are the day-to-day operations team
 * who should be paged for trip-level events.
 */
const OPERATOR_ROLES: readonly MembershipRole[] = [
  'DISPATCHER',
  'FIELD_OPERATOR',
  'DOCUMENT_STAFF'
];

/**
 * Resolves the candidate recipient set for a `NotificationRule` against a
 * concrete `TripDomainEvent`.
 *
 * The resolver is purely a recipient-discovery component — it does not write
 * `Notification` rows, apply preferences, or perform RBAC trip-access
 * filtering. Those are downstream stages in the orchestrator pipeline. The
 * resolver's contract is:
 *
 *  1. Never return a user from an organization other than
 *     `event.organizationId` (cross-org guard, Requirement 7.7).
 *  2. Evaluate membership / participant state "as-of" `event.occurredAt`
 *     using the snapshot fields available today (`status`, `deletedAt`,
 *     `createdAt`). True point-in-time history would require a separate
 *     `MembershipHistory` table; that upgrade is out of scope for this task.
 *  3. Treat duplicates per scope deterministically — the orchestrator
 *     additionally de-dups by `(eventId, recipientUserId, channel)`, so
 *     idempotency at the database layer remains the source of truth, but we
 *     still avoid emitting trivially repeated rows here.
 *
 * Per Requirement 7.5, an `assigned_driver` scope with no live driver emits
 * a `notification_recipient_missing` log line so an admin can see the gap.
 * The actual metric backend is wired in a later task; the Nest logger
 * placeholder keeps the call site stable.
 */
@Injectable()
export class RecipientResolver {
  private readonly logger = new Logger(RecipientResolver.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async resolveRecipients(
    rule: NotificationRule,
    event: TripDomainEvent
  ): Promise<RecipientResolution[]> {
    // Defence-in-depth cross-org guard. The orchestrator already filters
    // rules by `organizationId === event.organizationId` when selecting
    // candidate rules, but a stale or hand-crafted invocation must still
    // produce zero recipients (Requirement 7.7).
    if (rule.organizationId !== event.organizationId) {
      return [];
    }

    switch (rule.recipientScope) {
      case 'trip_participants':
        return this.resolveTripParticipants(event);
      case 'organization_admins':
        return this.resolveByMembershipRoles(event, ADMIN_ROLES);
      case 'organization_operators':
        return this.resolveByMembershipRoles(event, OPERATOR_ROLES);
      case 'assigned_driver':
        return this.resolveAssignedDriver(rule, event);
      case 'custom_user_list':
        return this.resolveCustomUserList(rule, event);
      default:
        // Forward-compatibility: an unknown scope (e.g. introduced by a
        // newer migration but unsupported by this version of the resolver)
        // produces zero recipients rather than failing the orchestrator
        // pipeline. Logged at warn level so it is visible in dashboards.
        this.logger.warn(
          `Unknown recipientScope "${rule.recipientScope}" on rule ${rule.id}; returning empty recipient set.`
        );
        return [];
    }
  }

  /**
   * Scope: `trip_participants`.
   *
   * Pulls every `TripParticipant` row for the trip with a non-null `userId`,
   * then filters to those users who are active, non-deleted members of
   * `event.organizationId` whose membership existed at `event.occurredAt`.
   * The membership filter is what enforces the cross-org guard for partner
   * trips where participants from another organization may be present.
   */
  private async resolveTripParticipants(event: TripDomainEvent): Promise<RecipientResolution[]> {
    const participants = await this.prisma.tripParticipant.findMany({
      where: {
        tripId: event.tripId,
        userId: { not: null }
      },
      select: { userId: true }
    });

    const userIds = [
      ...new Set(participants.map((row) => row.userId).filter((id): id is string => id !== null))
    ];
    if (userIds.length === 0) {
      return [];
    }

    const memberships = await this.prisma.membership.findMany({
      where: {
        organizationId: event.organizationId,
        userId: { in: userIds },
        status: 'ACTIVE',
        deletedAt: null,
        createdAt: { lte: event.occurredAt }
      },
      select: { userId: true, role: true }
    });

    return memberships.map((row) => ({
      userId: row.userId,
      organizationId: event.organizationId,
      role: row.role
    }));
  }

  /**
   * Shared backend for `organization_admins` and `organization_operators`.
   *
   * Selects active, non-deleted members of `event.organizationId` whose
   * membership existed at `event.occurredAt` and whose role is in the
   * provided role set. The `(organizationId, userId)` unique constraint on
   * `Membership` guarantees no duplicates, but we still defensively
   * de-duplicate by `userId` so the contract holds even if the schema later
   * drops the constraint.
   */
  private async resolveByMembershipRoles(
    event: TripDomainEvent,
    roles: readonly MembershipRole[]
  ): Promise<RecipientResolution[]> {
    const memberships = await this.prisma.membership.findMany({
      where: {
        organizationId: event.organizationId,
        role: { in: [...roles] },
        status: 'ACTIVE',
        deletedAt: null,
        createdAt: { lte: event.occurredAt }
      },
      select: { userId: true, role: true }
    });

    const seen = new Set<string>();
    const result: RecipientResolution[] = [];
    for (const row of memberships) {
      if (seen.has(row.userId)) {
        continue;
      }
      seen.add(row.userId);
      result.push({
        userId: row.userId,
        organizationId: event.organizationId,
        role: row.role
      });
    }
    return result;
  }

  /**
   * Scope: `assigned_driver`.
   *
   * Loads the trip's `driverProfile.userId` and emits a single recipient
   * when the driver is currently assigned and not soft-deleted. Drivers do
   * not always have a `Membership` row (they may use the driver mobile app
   * without admin privileges in the org), so the membership lookup is best
   * effort and only used to populate `role` when present.
   *
   * If the trip has no live driver at `event.occurredAt`, we emit a
   * `notification_recipient_missing` log line (Requirement 7.5) and return
   * an empty list so the orchestrator can short-circuit cleanly.
   */
  private async resolveAssignedDriver(
    rule: NotificationRule,
    event: TripDomainEvent
  ): Promise<RecipientResolution[]> {
    const trip = await this.prisma.trip.findFirst({
      where: { id: event.tripId, organizationId: event.organizationId },
      select: {
        driverProfile: {
          select: { userId: true, deletedAt: true }
        }
      }
    });

    const driverUserId = trip?.driverProfile?.userId ?? null;
    const driverActive = trip?.driverProfile != null && trip.driverProfile.deletedAt === null;

    if (!driverUserId || !driverActive) {
      this.logger.warn(
        `notification_recipient_missing tripId=${event.tripId} ruleId=${rule.id} eventId=${event.eventId} scope=assigned_driver`
      );
      return [];
    }

    // Best-effort role lookup. If the driver is not also a member of the
    // organization (common for driver-only accounts), `role` stays
    // undefined and downstream RBAC code falls back to its own checks.
    const membership = await this.prisma.membership.findFirst({
      where: {
        organizationId: event.organizationId,
        userId: driverUserId,
        status: 'ACTIVE',
        deletedAt: null,
        createdAt: { lte: event.occurredAt }
      },
      select: { role: true }
    });

    const resolution: RecipientResolution = {
      userId: driverUserId,
      organizationId: event.organizationId
    };
    if (membership?.role) {
      // `exactOptionalPropertyTypes` requires us to omit `role` entirely
      // when the driver has no organization membership — assigning
      // `undefined` is not equivalent under that flag.
      resolution.role = membership.role;
    }
    return [resolution];
  }

  /**
   * Scope: `custom_user_list`.
   *
   * Cross-references `rule.customUserIds` against the active membership of
   * `rule.organizationId` (= `event.organizationId` after the top-level
   * guard). Any id that does not resolve to an active, non-deleted member
   * is silently skipped — this is the runtime side of the cross-org guard
   * (Requirement 7.7), complementing the write-time validation enforced by
   * `NotificationRulesService.assertCustomUserIdsBelongToOrg`. Skipping
   * (rather than throwing) means a member who later leaves the org simply
   * stops receiving notifications without breaking the rule for the rest
   * of the list.
   */
  private async resolveCustomUserList(
    rule: NotificationRule,
    event: TripDomainEvent
  ): Promise<RecipientResolution[]> {
    const ids = [...new Set(rule.customUserIds)];
    if (ids.length === 0) {
      return [];
    }

    const memberships = await this.prisma.membership.findMany({
      where: {
        organizationId: event.organizationId,
        userId: { in: ids },
        status: 'ACTIVE',
        deletedAt: null,
        createdAt: { lte: event.occurredAt }
      },
      select: { userId: true, role: true }
    });

    return memberships.map((row) => ({
      userId: row.userId,
      organizationId: event.organizationId,
      role: row.role
    }));
  }
}
