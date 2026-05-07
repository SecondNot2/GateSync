import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NotificationChannel, Prisma } from '@prisma/client';
import type { RequestUser } from '../auth/request-user';
import { PrismaService } from '../prisma/prisma.service';

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

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly configService: ConfigService
  ) {}

  async listUserNotifications(user: RequestUser) {
    return this.prisma.notification.findMany({
      where: {
        recipientUserId: user.id
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

    if (!documentStaffEventTypes.some((item) => item === eventType)) {
      roles.add('DOCUMENT_STAFF');
    }

    if (!fieldOperatorEventTypes.some((item) => item === eventType)) {
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
