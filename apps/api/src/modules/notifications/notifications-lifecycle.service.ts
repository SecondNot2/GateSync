import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional
} from '@nestjs/common';
import type { Notification } from '@prisma/client';
import type { RequestUser } from '../auth/request-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  REALTIME_CHANNEL_PORT,
  type RealtimeChannelPort,
  type RealtimeMessage
} from './realtime/realtime-channel.port';

/**
 * NotificationsLifecycleService
 *
 * Self-service lifecycle operations for a single in-app `Notification`:
 * mark-as-read and hide. Both operations are strictly self-only — only
 * the recipient may transition the row — and the read transition also
 * broadcasts a minimal "read" update through the `RealtimeChannelPort`
 * so other open sessions of the same user can sync without polling.
 *
 * Authorization model (Requirements 12.1, 12.3):
 * - The caller must equal `notification.recipientUserId`. Mismatch =>
 *   `FORBIDDEN`.
 * - A notification that does not exist, or belongs to an organization the
 *   caller is not a member of, surfaces as `NOT_FOUND` so we never leak
 *   the existence of cross-tenant rows.
 *
 * Idempotency: re-marking a notification as `READ`/`HIDDEN` is safe and
 * a no-op besides refreshing `readAt` / re-broadcasting. We accept the
 * minor cost (a single update per call) in exchange for simpler clients.
 *
 * Realtime: the broadcast is best-effort. The port is `@Optional()` so
 * the service still works in test/dev wiring where realtime isn't
 * registered. Any broadcast error is swallowed — the persisted state is
 * the source of truth, and the client will re-fetch on reconnect.
 */
@Injectable()
export class NotificationsLifecycleService {
  private readonly logger = new Logger(NotificationsLifecycleService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional()
    @Inject(REALTIME_CHANNEL_PORT)
    private readonly realtime?: RealtimeChannelPort
  ) {}

  async markRead(user: RequestUser, notificationId: string): Promise<Notification> {
    const notification = await this.loadOwnedNotification(user, notificationId);

    const updated = await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: 'READ',
        readAt: notification.readAt ?? new Date()
      }
    });

    await this.broadcastReadUpdate(user, updated);

    return updated;
  }

  async hide(user: RequestUser, notificationId: string): Promise<Notification> {
    const notification = await this.loadOwnedNotification(user, notificationId);

    return this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: 'HIDDEN'
      }
    });
  }

  /**
   * Load a notification and assert the caller is its recipient and a
   * member of its organization. Cross-tenant or non-existent rows are
   * reported as `NOT_FOUND` (no existence leak); a recipient mismatch
   * within a tenant the caller belongs to is reported as `FORBIDDEN`.
   */
  private async loadOwnedNotification(
    user: RequestUser,
    notificationId: string
  ): Promise<Notification> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId }
    });

    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo.');
    }

    const sharesTenant = user.memberships.some(
      (membership) => membership.organizationId === notification.organizationId
    );

    if (!sharesTenant) {
      // Cross-tenant access must look identical to "row does not exist"
      // so we never leak whether the id corresponds to another org.
      throw new NotFoundException('Không tìm thấy thông báo.');
    }

    if (notification.recipientUserId !== user.id) {
      throw new ForbiddenException('Bạn không có quyền cập nhật thông báo này.');
    }

    return notification;
  }

  private async broadcastReadUpdate(user: RequestUser, notification: Notification): Promise<void> {
    if (!this.realtime || !notification.recipientUserId) {
      return;
    }

    const message: RealtimeMessage = {
      deliveryId: notification.id,
      eventType: 'notification_read',
      occurredAt: (notification.readAt ?? new Date()).toISOString(),
      title: '',
      body: '',
      ...(notification.tripId ? { tripId: notification.tripId } : {})
    };

    try {
      const result = await this.realtime.publishToUser(
        notification.organizationId,
        notification.recipientUserId,
        message
      );

      if (result.status === 'FAILED') {
        this.logger.warn(
          `Realtime read-update broadcast failed for notification ${notification.id}: ${result.reason} (transient=${result.transient}).`
        );
      }
    } catch (error) {
      // Broadcasts are best-effort. Persisted state is authoritative;
      // clients will reconcile on next fetch / reconnect.
      this.logger.warn(
        `Realtime read-update broadcast threw for notification ${notification.id}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`
      );
    }
  }
}
