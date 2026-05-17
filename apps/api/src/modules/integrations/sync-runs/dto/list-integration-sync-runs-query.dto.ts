import { ApiPropertyOptional } from '@nestjs/swagger';
import { IntegrationProvider, IntegrationSyncRunStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/**
 * Query DTO for `GET /api/v1/integration-sync-runs`.
 *
 * Pagination follows the project convention used by `ListAuditLogsQueryDto`:
 * cursor-based pagination keyed by row id, descending by `startedAt`. The
 * caller passes the `id` of the last row from the previous page as `cursor`.
 *
 * Notes on tenant scope: this DTO intentionally does NOT expose
 * `organizationId`. The endpoint derives `organizationId` from the
 * authenticated user's active OWNER/ADMIN membership (see
 * `IntegrationSyncRunsController`) — it must never be supplied by the caller.
 *
 * Design references: Requirements 4.1, 4.2, 4.3, 4.4, 4.5.
 */
export class ListIntegrationSyncRunsQueryDto {
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
    description: 'Restrict results to a specific integration provider.',
    enum: IntegrationProvider,
    example: IntegrationProvider.CUA_KHAU_SO
  })
  @IsOptional()
  @IsEnum(IntegrationProvider)
  provider?: IntegrationProvider;

  @ApiPropertyOptional({
    description:
      'Restrict results to a specific integration account (must belong to caller organization).',
    example: '00000000-0000-4000-8000-000000000001'
  })
  @IsOptional()
  @IsUUID()
  integrationAccountId?: string;

  @ApiPropertyOptional({
    description: 'Restrict results to a specific sync-run status.',
    enum: IntegrationSyncRunStatus,
    example: IntegrationSyncRunStatus.FAILED
  })
  @IsOptional()
  @IsEnum(IntegrationSyncRunStatus)
  status?: IntegrationSyncRunStatus;

  @ApiPropertyOptional({
    description: 'Lower bound (inclusive) for `startedAt`, ISO-8601 timestamp.',
    example: '2025-01-01T00:00:00.000Z'
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({
    description: 'Upper bound (inclusive) for `startedAt`, ISO-8601 timestamp.',
    example: '2025-12-31T23:59:59.999Z'
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
