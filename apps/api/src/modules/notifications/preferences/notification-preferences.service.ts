import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { NotificationChannel, NotificationPreference } from '@prisma/client';
import type { NotificationEventType } from '@gatesync/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { NotificationPreferenceItemInput } from './dto';

/**
 * Self-only CRUD service for `NotificationPreference`.
 *
 * `userId` and `organizationId` are passed in by the controller after being
 * derived from the authenticated `RequestUser`. The service NEVER reads
 * either value from the request body, which makes cross-user writes
 * structurally impossible at this layer (Requirement 10.4).
 */
@Injectable()
export class NotificationPreferencesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Return raw `NotificationPreference` rows for the current user.
   *
   * `organizationId` is required so the response is always tenant-scoped —
   * cross-tenant aggregation is intentionally not exposed here. Rows are
   * returned untransformed so the API contract matches the Prisma model
   * (per the spec's "no view-model layer at API" rule).
   */
  async findForCurrentUser(
    userId: string,
    organizationId: string
  ): Promise<NotificationPreference[]> {
    return this.prisma.notificationPreference.findMany({
      where: { userId, organizationId },
      orderBy: [{ eventType: 'asc' }, { channel: 'asc' }]
    });
  }

  /**
   * Bulk-upsert preferences for the current user.
   *
   * Behaviour:
   * - Each item is upserted on the composite unique
   *   `(userId, organizationId, eventType, channel)`. Existing rows update
   *   only the `enabled` flag; missing rows are created with the supplied
   *   value.
   * - All upserts run inside a single `prisma.$transaction` so the bulk
   *   operation is atomic — a failure on any item rolls back the entire
   *   batch.
   * - The function returns the post-write rows for the `(userId,
   *   organizationId)` pair so callers can refresh their cache without an
   *   extra round-trip.
   *
   * Authorization: `userId` and `organizationId` MUST come from the
   * resolved request user / a body field validated by the controller — the
   * controller is responsible for rejecting cross-user payloads with
   * `FORBIDDEN`. This method assumes both inputs are already trusted.
   *
   * @param userId         Authenticated user id (from JWT-resolved RequestUser).
   * @param organizationId Organization the preferences belong to.
   * @param items          Preference toggles parsed by Zod in the controller.
   */
  async upsertForCurrentUser(
    userId: string,
    organizationId: string,
    items: readonly NotificationPreferenceItemInput[]
  ): Promise<NotificationPreference[]> {
    if (items.length === 0) {
      return this.findForCurrentUser(userId, organizationId);
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        await tx.notificationPreference.upsert({
          where: {
            userId_organizationId_eventType_channel: {
              userId,
              organizationId,
              eventType: item.eventType,
              channel: item.channel as NotificationChannel
            }
          },
          create: {
            userId,
            organizationId,
            eventType: item.eventType as NotificationEventType,
            channel: item.channel as NotificationChannel,
            enabled: item.enabled
          },
          update: {
            enabled: item.enabled
          }
        });
      }

      return tx.notificationPreference.findMany({
        where: { userId, organizationId },
        orderBy: [{ eventType: 'asc' }, { channel: 'asc' }]
      });
    });
  }

  /**
   * Reusable guard used by the controller to enforce Requirement 10.4: a
   * payload that names a different `userId` than the authenticated caller is
   * a cross-user write attempt and must be rejected with `FORBIDDEN`.
   *
   * Kept here (rather than inlined in the controller) so the rule is
   * colocated with the rest of the preference authorisation logic and is
   * unit-testable in isolation.
   */
  static assertSameUser(authenticatedUserId: string, bodyUserId: string | undefined): void {
    if (bodyUserId !== undefined && bodyUserId !== authenticatedUserId) {
      throw new ForbiddenException(
        'Không được phép cập nhật tuỳ chọn thông báo của người dùng khác.'
      );
    }
  }
}
