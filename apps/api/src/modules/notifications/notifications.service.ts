import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MembershipRole, NotificationChannel, Prisma } from '@prisma/client';
import type { RequestUser } from '../auth/request-user';
import { PrismaService } from '../prisma/prisma.service';
import type { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

type PrismaExecutor = Prisma.TransactionClient | PrismaService;

type TripEventNotificationInput = {
  id: string;
  eventType: string;
  occurredAt: Date;
};
type CuaKhauSoDocumentStaffNotificationInput = {
  kind: 'cua_khau_so_border_guard_lag' | 'cua_khau_so_transshipment_ready';
  idempotencyKey: string;
  eventType: string;
  title: string;
  message: string;
  occurredAt: Date;
  declarationNumber: string;
};

const importantTripEventTypes = [
  'DEPARTED',
  'ARRIVED_BORDER_AREA',
  'WAITING_YARD_ENTRY',
  'YARD_ENTRY_CONFIRMED',
  'YARD_EXIT_CONFIRMED',
  'DECLARATION_REJECTED',
  'INSPECTION_REQUIRED',
  'BORDER_GATE_EXIT_CONFIRMED',
  'TRANSSHIPMENT_ELIGIBLE',
  'TRANSSHIPMENT_SIGNED',
  'TRANSSHIPMENT_STARTED',
  'TRANSSHIPMENT_COMPLETED',
  'DRIVER_LOCATION_SHARED',
  'DRIVER_MEDIA_UPLOADED',
  'RELEASE_READY',
  'RELEASE_REQUESTED',
  'VEHICLE_RELEASED',
  'TRIP_COMPLETED',
  'TRIP_CANCELLED'
] as const;

type DefaultRecipientRole = 'OWNER' | 'ADMIN' | 'DISPATCHER' | 'DOCUMENT_STAFF' | 'FIELD_OPERATOR';

const documentStaffEventTypes = [
  'YARD_ENTRY_CONFIRMED',
  'TRANSSHIPMENT_ELIGIBLE',
  'TRANSSHIPMENT_SIGNED',
  'TRANSSHIPMENT_COMPLETED',
  'DRIVER_LOCATION_SHARED',
  'DRIVER_MEDIA_UPLOADED',
  'RELEASE_READY',
  'VEHICLE_RELEASED'
] as const;

const fieldOperatorEventTypes = [
  'TRANSSHIPMENT_ELIGIBLE',
  'TRANSSHIPMENT_SIGNED',
  'RELEASE_READY',
  'RELEASE_REQUESTED'
] as const;

const driverRecipientEventTypes = [
  'TRANSSHIPMENT_COMPLETED',
  'RELEASE_READY',
  'RELEASE_REQUESTED'
] as const;

const supportedChannels = ['IN_APP', 'WEB_PUSH', 'ZALO_OA', 'SMS', 'EMAIL'] as const;

const ADMIN_ROLES: readonly MembershipRole[] = ['OWNER', 'ADMIN'];

const DEFAULT_PAGE_SIZE = 50;

const NOTIFICATION_DETAIL_INCLUDE = {
  trip: {
    select: {
      id: true,
      tripCode: true,
      currentStatus: true,
      vehicle: true,
      driverProfile: true,
      customsDeclaration: true
    }
  },
  organization: {
    select: {
      id: true,
      name: true,
      type: true
    }
  }
} satisfies Prisma.NotificationInclude;

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly configService: ConfigService
  ) {}

  async listUserNotifications(user: RequestUser, afterDate?: Date) {
    return this.prisma.notification.findMany({
      where: {
        recipientUserId: user.id,
        ...(afterDate ? { createdAt: { gt: afterDate } } : {})
      },
      include: {
        trip: {
          select: {
            id: true,
            tripCode: true,
            currentStatus: true,
            vehicle: true,
            driverProfile: true,
            customsDeclaration: true
          }
        },
        organization: {
          select: {
            id: true,
            name: true,
            type: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 50
    });
  }

  /**
   * `GET /api/v1/notifications` (Requirements 11.1, 11.2, 11.3).
   *
   * - **Admin caller** (`OWNER` / `ADMIN` membership of an organization):
   *   returns every `Notification` row for that organization, regardless of
   *   `recipientUserId`. Tenant scope is taken from the admin's resolved
   *   membership; the caller cannot influence it.
   * - **Non-admin caller**: returns only rows where `recipientUserId = user.id`.
   *   No `organizationId` filter is applied because a user may have multiple
   *   memberships and should see their inbox across all of them.
   *
   * Filters: `eventType` (matched against `payload.eventType` JSON field),
   * `channel`, `status`, time range (`from` / `to` on `createdAt`). Sorted by
   * `createdAt DESC, id DESC`. Cursor-based pagination keyed by `id`.
   */
  async listNotifications(user: RequestUser, query: ListNotificationsQueryDto) {
    const take = query.limit ?? DEFAULT_PAGE_SIZE;
    const adminMembership = user.memberships.find(
      (membership) =>
        membership.status === 'ACTIVE' && ADMIN_ROLES.some((role) => role === membership.role)
    );

    const where: Prisma.NotificationWhereInput = adminMembership
      ? { organizationId: adminMembership.organizationId }
      : { recipientUserId: user.id };

    if (query.channel) {
      where.channel = query.channel;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.from || query.to || query.after) {
      where.createdAt = {};
      if (query.from) {
        where.createdAt.gte = query.from;
      }
      if (query.to) {
        where.createdAt.lte = query.to;
      }
      if (query.after) {
        // `after` is the legacy "strictly newer than" filter used by the web
        // client for incremental polling. It is independent of `from`/`to`
        // and applied as a `gt` bound on `createdAt`.
        where.createdAt.gt = query.after;
      }
    }

    if (query.eventType) {
      // The orchestrator stores the notification eventType inside the JSON
      // `payload`. Use Prisma's `path` filter so the filter survives
      // payload-shape evolution as long as the `eventType` key is present.
      where.payload = {
        path: ['eventType'],
        equals: query.eventType
      };
    }

    const findArgs: Prisma.NotificationFindManyArgs = {
      where,
      include: NOTIFICATION_DETAIL_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take
    };

    if (query.cursor) {
      findArgs.skip = 1;
      findArgs.cursor = { id: query.cursor };
    }

    const rows = await this.prisma.notification.findMany(findArgs);
    const lastRow = rows.length === take ? rows[rows.length - 1] : undefined;
    const nextCursor = lastRow?.id ?? null;

    return {
      data: rows,
      nextCursor
    };
  }

  /**
   * `GET /api/v1/notifications/:id` (Requirements 11.1, 11.2, 11.3).
   *
   * Returns the full notification record after enforcing access:
   *
   *  - The caller must be the `recipientUserId` OR an active admin
   *    (`OWNER` / `ADMIN`) of the notification's organization.
   *  - If the notification references a `tripId`, the caller must additionally
   *    have access to that trip — either because they are an admin in the
   *    organization, or because they are a `TripParticipant` on that trip.
   *
   * Anything else maps to `FORBIDDEN`. A row that does not exist at all maps
   * to `NOT_FOUND`. Tenant existence is never leaked: a notification belonging
   * to another organization that the caller has no relationship with also
   * surfaces as `NOT_FOUND` so probing for ids cannot enumerate other orgs.
   */
  async getNotificationDetail(user: RequestUser, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: NOTIFICATION_DETAIL_INCLUDE
    });

    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo.');
    }

    const isRecipient =
      notification.recipientUserId !== null && notification.recipientUserId === user.id;

    const adminMembershipForOrg = user.memberships.find(
      (membership) =>
        membership.organizationId === notification.organizationId &&
        membership.status === 'ACTIVE' &&
        ADMIN_ROLES.some((role) => role === membership.role)
    );

    if (!isRecipient && !adminMembershipForOrg) {
      // Hide cross-tenant existence: callers with no relationship to the
      // notification's organization should not be able to distinguish
      // "wrong tenant" from "wrong id".
      const hasAnyMembershipInOrg = user.memberships.some(
        (membership) =>
          membership.organizationId === notification.organizationId &&
          membership.status === 'ACTIVE'
      );
      if (!hasAnyMembershipInOrg) {
        throw new NotFoundException('Không tìm thấy thông báo.');
      }
      throw new ForbiddenException('Bạn không có quyền xem thông báo này.');
    }

    if (notification.tripId) {
      const hasTripAccess =
        adminMembershipForOrg !== undefined ||
        (await this.canAccessTrip(user.id, notification.tripId, notification.organizationId));

      if (!hasTripAccess) {
        throw new ForbiddenException(
          'Bạn không có quyền xem chuyến hàng liên quan đến thông báo này.'
        );
      }
    }

    return notification;
  }

  /**
   * Returns `true` when `userId` has trip-level access to `tripId` within
   * `organizationId` via a `TripParticipant` row. Used by
   * {@link getNotificationDetail} to gate access to trip-bound notifications
   * for non-admin recipients (e.g. a `custom_user_list` recipient who is a
   * peer in the organization but not on the trip).
   */
  private async canAccessTrip(
    userId: string,
    tripId: string,
    organizationId: string
  ): Promise<boolean> {
    const participant = await this.prisma.tripParticipant.findFirst({
      where: {
        tripId,
        userId,
        OR: [
          { organizationId },
          // Cross-org partner participation rows may have a null
          // `organizationId`; allow those through since the participant
          // row itself authorizes access.
          { organizationId: null }
        ]
      },
      select: { id: true }
    });

    return participant !== null;
  }

  async markRead(user: RequestUser, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        recipientUserId: user.id
      }
    });

    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo.');
    }

    if (notification.recipientUserId !== user.id) {
      throw new ForbiddenException('Bạn không có quyền cập nhật thông báo này.');
    }

    return this.prisma.notification.update({
      where: {
        id: notification.id
      },
      data: {
        status: 'READ',
        readAt: new Date()
      }
    });
  }

  async markAllRead(user: RequestUser) {
    return this.prisma.notification.updateMany({
      where: {
        recipientUserId: user.id,
        status: {
          not: 'READ'
        }
      },
      data: {
        status: 'READ',
        readAt: new Date()
      }
    });
  }

  async clearAll(user: RequestUser) {
    return this.prisma.notification.deleteMany({
      where: {
        recipientUserId: user.id
      }
    });
  }

  async createTripEventNotifications(
    prisma: PrismaExecutor,
    organizationId: string,
    tripId: string,
    event: TripEventNotificationInput,
    currentStatus: string
  ) {
    if (!importantTripEventTypes.some((eventType) => eventType === event.eventType)) {
      return;
    }

    const [membershipRecipients, tripRecipients] = await Promise.all([
      prisma.membership.findMany({
        where: {
          organizationId,
          status: 'ACTIVE',
          role: {
            in: this.resolveMembershipRecipientRoles(event.eventType)
          }
        },
        select: {
          userId: true
        }
      }),
      prisma.trip.findFirst({
        where: {
          id: tripId,
          organizationId,
          deletedAt: null
        },
        select: {
          driverProfile: {
            select: {
              userId: true
            }
          },
          participants: {
            where: {
              userId: {
                not: null
              }
            },
            select: {
              userId: true,
              role: true
            }
          }
        }
      })
    ]);

    const recipientUserIds = new Set(membershipRecipients.map((membership) => membership.userId));

    if (driverRecipientEventTypes.some((eventType) => eventType === event.eventType)) {
      if (tripRecipients?.driverProfile?.userId) {
        recipientUserIds.add(tripRecipients.driverProfile.userId);
      }

      tripRecipients?.participants
        .filter((participant) => participant.role === 'DRIVER' && participant.userId)
        .forEach((participant) => recipientUserIds.add(participant.userId as string));
    }

    if (recipientUserIds.size === 0) {
      return;
    }

    const channels = this.resolveEnabledChannels();

    await prisma.notification.createMany({
      data: [...recipientUserIds].flatMap((recipientUserId) =>
        channels.map((channel) => ({
          organizationId,
          tripId,
          recipientUserId,
          channel: channel as unknown as NotificationChannel,
          status: 'PENDING' as const,
          payload: {
            kind: 'trip_event',
            eventId: event.id,
            eventType: event.eventType,
            currentStatus,
            occurredAt: event.occurredAt.toISOString(),
            delivery: this.resolveDeliveryHint(channel)
          }
        }))
      )
    });
  }

  async createCuaKhauSoDocumentStaffNotifications(
    prisma: PrismaExecutor,
    organizationId: string,
    tripId: string,
    input: CuaKhauSoDocumentStaffNotificationInput
  ) {
    const recipients = await prisma.membership.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        role: 'DOCUMENT_STAFF'
      },
      select: {
        userId: true
      }
    });
    const recipientUserIds = [...new Set(recipients.map((recipient) => recipient.userId))];

    if (recipientUserIds.length === 0) {
      return;
    }

    const existingNotifications = await prisma.notification.findMany({
      where: {
        organizationId,
        tripId,
        recipientUserId: {
          in: recipientUserIds
        },
        channel: 'IN_APP'
      },
      select: {
        recipientUserId: true,
        payload: true
      }
    });
    const alreadyNotifiedUserIds = new Set(
      existingNotifications
        .filter((notification) =>
          this.hasIdempotencyKey(notification.payload, input.idempotencyKey)
        )
        .map((notification) => notification.recipientUserId)
        .filter((userId): userId is string => Boolean(userId))
    );
    const pendingRecipientUserIds = recipientUserIds.filter(
      (recipientUserId) => !alreadyNotifiedUserIds.has(recipientUserId)
    );

    if (pendingRecipientUserIds.length === 0) {
      return;
    }

    await prisma.notification.createMany({
      data: pendingRecipientUserIds.map((recipientUserId) => ({
        organizationId,
        tripId,
        recipientUserId,
        channel: 'IN_APP' as unknown as NotificationChannel,
        status: 'PENDING' as const,
        payload: {
          kind: input.kind,
          idempotencyKey: input.idempotencyKey,
          eventType: input.eventType,
          title: input.title,
          message: input.message,
          declarationNumber: input.declarationNumber,
          occurredAt: input.occurredAt.toISOString(),
          delivery: 'ready'
        }
      }))
    });
  }

  private resolveMembershipRecipientRoles(eventType: string) {
    const roles = new Set<DefaultRecipientRole>(['OWNER', 'ADMIN', 'DISPATCHER']);

    if (documentStaffEventTypes.some((item) => item === eventType)) {
      roles.add('DOCUMENT_STAFF');
    }

    if (fieldOperatorEventTypes.some((item) => item === eventType)) {
      roles.add('FIELD_OPERATOR');
    }

    return [...roles];
  }

  private resolveEnabledChannels(): Array<(typeof supportedChannels)[number]> {
    const configured = this.configService.get<string>('GATESYNC_NOTIFICATION_CHANNELS');

    if (!configured) {
      return [...supportedChannels];
    }

    const channels = configured
      .split(',')
      .map((value) => value.trim().toUpperCase())
      .filter((value): value is (typeof supportedChannels)[number] =>
        supportedChannels.some((channel) => channel === value)
      );

    return channels.length > 0 ? channels : ['IN_APP'];
  }

  private resolveDeliveryHint(channel: string) {
    if (channel === 'IN_APP') {
      return 'ready';
    }

    return 'queued_provider_adapter';
  }

  private hasIdempotencyKey(payload: Prisma.JsonValue | null, idempotencyKey: string) {
    return (
      payload !== null &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      (payload as Record<string, unknown>).idempotencyKey === idempotencyKey
    );
  }

  async broadcastTripEventSignal(organizationId: string, tripId: string, eventType: string) {
    try {
      await this.prisma.$queryRaw`
        SELECT realtime.send(
          ${JSON.stringify({ tripId, eventType })}::jsonb,
          ${eventType},
          ${`org_${organizationId}_events`},
          true
        )
      `;
    } catch {
      return;
    }
  }
}
