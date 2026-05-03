import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min
} from 'class-validator';
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
    example: 'GS-EXP'
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

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

  @ApiPropertyOptional({
    example: '00000000-0000-4000-8000-000000000014'
  })
  @IsOptional()
  @IsUUID()
  borderGateId?: string;

  @ApiPropertyOptional({
    example: '00000000-0000-4000-8000-000000000015'
  })
  @IsOptional()
  @IsUUID()
  yardId?: string;

  @ApiPropertyOptional({
    example: '00000000-0000-4000-8000-000000000011'
  })
  @IsOptional()
  @IsUUID()
  driverProfileId?: string;

  @ApiPropertyOptional({
    example: '00000000-0000-4000-8000-000000000010'
  })
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiPropertyOptional({
    example: '2026-05-04T00:00:00.000Z'
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-05-04T23:59:59.999Z'
  })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
