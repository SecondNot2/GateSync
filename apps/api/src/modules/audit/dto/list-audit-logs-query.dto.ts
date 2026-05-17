import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

/**
 * Query DTO for `GET /api/v1/audit-logs`.
 *
 * Pagination follows the project convention used by `ListTripsQueryDto`:
 * cursor-based pagination keyed by row id, descending by `createdAt`. The
 * caller passes the `id` of the last row from the previous page as `cursor`.
 *
 * Notes on tenant scope: this DTO intentionally does NOT expose
 * `organizationId`. The audit log endpoint derives `organizationId` from the
 * authenticated user's active OWNER/ADMIN membership (see
 * `AuditController`) — it must never be supplied by the caller.
 */
export class ListAuditLogsQueryDto {
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
    description: 'Restrict results to a specific entity type (canonical string).',
    example: 'NOTIFICATION_RULE'
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  entityType?: string;

  @ApiPropertyOptional({
    description: 'Restrict results to a specific entity instance.',
    example: '00000000-0000-4000-8000-000000000001'
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  entityId?: string;
}
