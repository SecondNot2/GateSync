import { ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel, NotificationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min
} from 'class-validator';

/**
 * Query DTO for `GET /api/v1/notifications`.
 *
 * Pagination follows the project convention used by `ListIntegrationSyncRunsQueryDto`
 * and `ListAuditLogsQueryDto`: cursor-based, keyed by row id, descending by
 * `createdAt`. The caller passes the `id` of the last row from the previous
 * page as `cursor`.
 *
 * Notes on tenant scope: this DTO intentionally does NOT expose
 * `organizationId`. The endpoint derives `organizationId` from the
 * authenticated user's active membership (admin scope) or filters to the
 * caller's own notifications (self scope) — it must never be supplied by the
 * caller.
 *
 * `eventType` is matched against the `payload.eventType` JSON field on
 * `Notification` since the orchestrator stores the notification eventType
 * (`trip_status_changed`, `vehicle_arrived_gate`, …) inside the payload.
 *
 * Design references: Requirements 11.1, 11.2, 11.3.
 */
export class ListNotificationsQueryDto {
  @ApiPropertyOptional({
    description: 'Maximum number of rows to return.',
    minimum: 1,
    maximum: 100,
    example: 50
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Cursor for pagination. Pass the `id` of the last row from the previous page.',
    example: '00000000-0000-4000-8000-000000000000'
  })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({
    description:
      'Filter by notification event type. Matched against `payload.eventType` JSON field.',
    example: 'trip_status_changed'
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  eventType?: string;

  @ApiPropertyOptional({
    description: 'Filter by notification channel.',
    enum: NotificationChannel,
    example: NotificationChannel.IN_APP
  })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @ApiPropertyOptional({
    description: 'Filter by notification delivery status.',
    enum: NotificationStatus,
    example: NotificationStatus.PENDING
  })
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @ApiPropertyOptional({
    description: 'Lower bound (inclusive) for `createdAt`, ISO-8601 timestamp.',
    example: '2025-01-01T00:00:00.000Z'
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({
    description: 'Upper bound (inclusive) for `createdAt`, ISO-8601 timestamp.',
    example: '2025-12-31T23:59:59.999Z'
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  /**
   * Legacy "load notifications strictly newer than X" parameter used by the
   * web client for incremental polling. Applied as `createdAt > after`,
   * complementary to `from`/`to`. Kept here so the existing frontend
   * keeps working until it migrates to cursor pagination.
   */
  @ApiPropertyOptional({
    description: 'Legacy: return rows with `createdAt` strictly greater than `after`.',
    example: '2025-01-01T00:00:00.000Z'
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  after?: Date;
}
