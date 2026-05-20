/**
 * NotificationRetentionService
 *
 * Background cron job that enforces the design retention policy for
 * `Notification` rows:
 *
 * - `READ` notifications  →  retained 90 days.
 * - All other statuses    →  retained 365 days.
 *
 * Rows older than the applicable window are deleted. The `Notification`
 * schema does not carry a soft-delete column, so a hard delete is the
 * only practical option here; audit history that must outlive the
 * retention window lives in `AuditLog`, not in this table.
 *
 * Validates: Requirements 4.7
 *
 * Cross-ref: design.md "Retention" section.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const READ_RETENTION_DAYS = 90;
const OTHER_RETENTION_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface NotificationRetentionReport {
  readDeleted: number;
  otherDeleted: number;
  readCutoff: Date;
  otherCutoff: Date;
}

@Injectable()
export class NotificationRetentionService {
  private readonly logger = new Logger(NotificationRetentionService.name);
  private running = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Cron entry point. Daily sweep is sufficient for 90 / 365-day windows
   * and avoids unnecessary delete pressure on the notifications table.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runScheduled(): Promise<void> {
    if (this.running) {
      this.logger.debug('Bỏ qua sweep retention notification: lần thực thi trước chưa hoàn tất.');
      return;
    }
    this.running = true;
    try {
      await this.purgeExpiredNotifications(new Date());
    } catch (err) {
      this.logger.error(this.describeError(err));
    } finally {
      this.running = false;
    }
  }

  /**
   * Apply both retention windows in a single sweep and return a report so
   * callers (tests, manual triggers) can assert progress.
   */
  async purgeExpiredNotifications(now: Date): Promise<NotificationRetentionReport> {
    const readCutoff = new Date(now.getTime() - READ_RETENTION_DAYS * MS_PER_DAY);
    const otherCutoff = new Date(now.getTime() - OTHER_RETENTION_DAYS * MS_PER_DAY);

    const readResult = await this.prisma.notification.deleteMany({
      where: {
        status: NotificationStatus.READ,
        createdAt: { lt: readCutoff }
      }
    });

    const otherResult = await this.prisma.notification.deleteMany({
      where: {
        status: { not: NotificationStatus.READ },
        createdAt: { lt: otherCutoff }
      }
    });

    if (readResult.count > 0 || otherResult.count > 0) {
      this.logger.log(
        `Đã xoá notifications quá hạn: READ=${readResult.count} ` +
          `(cutoff=${readCutoff.toISOString()}), khác READ=${otherResult.count} ` +
          `(cutoff=${otherCutoff.toISOString()}).`
      );
    } else {
      this.logger.debug(
        `Không có notification nào cần xoá (READ cutoff=${readCutoff.toISOString()}, ` +
          `khác cutoff=${otherCutoff.toISOString()}).`
      );
    }

    return {
      readDeleted: readResult.count,
      otherDeleted: otherResult.count,
      readCutoff,
      otherCutoff
    };
  }

  private describeError(value: unknown): string {
    if (value instanceof Error) {
      return `Sweep retention notification thất bại: ${value.message}`;
    }
    return `Sweep retention notification thất bại: ${String(value)}`;
  }
}
