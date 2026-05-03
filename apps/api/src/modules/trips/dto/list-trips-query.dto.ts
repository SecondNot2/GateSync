import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import type { TripStatus } from '@prisma/client';

const tripStatuses = [
  'PLANNED',
  'IN_PROGRESS',
  'WAITING_YARD_ENTRY',
  'IN_YARD',
  'AT_BORDER_GATE',
  'CUSTOMS_PROCESSING',
  'INSPECTION_REQUIRED',
  'BLOCKED',
  'DELAYED',
  'COMPLETED',
  'CANCELLED'
] satisfies TripStatus[];

export class ListTripsQueryDto {
  @ApiPropertyOptional({
    enum: tripStatuses,
    example: 'IN_YARD'
  })
  @IsOptional()
  @IsIn(tripStatuses)
  status?: TripStatus;

  @ApiPropertyOptional({
    example: 50,
    minimum: 1,
    maximum: 100
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    example: '00000000-0000-4000-8000-000000000020'
  })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}
