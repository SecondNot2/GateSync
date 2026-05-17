/**
 * SyncLogRetentionService
 *
 * Background cron job that enforces the design retention policy for
 * `IntegrationSyncLog.rawPayloadMasked`: rows older than 30 days have
 * their raw payload column cleared (set to NULL).
 *
 * This is intentionally a *clear* (not a delete) so that the structured
 * log row — level/code/message/sourceReference — remains available for
 * audit and debugging well past the 30-day window, while the bulkier
 * provider payload (kept only when `debugMode = true`) does not linger.
 *
 * Validates: Requirements 4.7
 *
 * Cross-ref: design.md "Retention" section.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const RAW_PAYLOAD_RETENTION_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class SyncLogRetentionService {
  private readonly logger = new Logger(SyncLogRetentionService.name);
  private running = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Cron entry point. Runs once an hour so a missed window (process
   * restart, deploy) is recovered quickly without overloading the DB.
   * Re-entrancy guard prevents overlap if a previous sweep is still in
   * flight (very large backlog on first deploy, for example).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async runScheduled(): Promise<void> {
    if (this.running) {
      this.logger.debug('Bỏ qua sweep retention sync log: lần thực thi trước chưa hoàn tất.');
      return;
    }
    this.running = true;
    try {
      await this.purgeExpiredRawPayloads(new Date());
    } catch (err) {
      this.logger.error(this.describeError(err));
    } finally {
      this.running = false;
    }
  }

  /**
   * Clear `rawPayloadMasked` for rows older than {@link RAW_PAYLOAD_RETENTION_DAYS}.
   *
   * Returns the count of affected rows so callers (tests, manual triggers)
   * can assert on progress.
   */
  async purgeExpiredRawPayloads(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - RAW_PAYLOAD_RETENTION_DAYS * MS_PER_DAY);
    const result = await this.prisma.integrationSyncLog.updateMany({
      where: {
        createdAt: { lt: cutoff },
        NOT: { rawPayloadMasked: { equals: Prisma.DbNull } }
      },
      data: { rawPayloadMasked: Prisma.DbNull }
    });

    if (result.count > 0) {
      this.logger.log(
        `Đã xoá rawPayloadMasked cho ${result.count} bản ghi IntegrationSyncLog cũ hơn ` +
          `${RAW_PAYLOAD_RETENTION_DAYS} ngày (cutoff=${cutoff.toISOString()}).`
      );
    } else {
      this.logger.debug(
        `Không có IntegrationSyncLog nào cần xoá rawPayloadMasked (cutoff=${cutoff.toISOString()}).`
      );
    }

    return result.count;
  }

  private describeError(value: unknown): string {
    if (value instanceof Error) {
      return `Sweep retention sync log thất bại: ${value.message}`;
    }
    return `Sweep retention sync log thất bại: ${String(value)}`;
  }
}
