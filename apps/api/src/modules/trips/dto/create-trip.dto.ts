import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { TripDirection, TripType } from '@prisma/client';

const tripTypes = [
  'EXPORT_WITH_GOODS',
  'IMPORT_WITH_GOODS',
  'EMPTY_VEHICLE_ENTRY',
  'EMPTY_VEHICLE_EXIT',
  'YARD_ONLY',
  'INTERNAL_TRANSFER'
] satisfies TripType[];

const tripDirections = ['EXPORT', 'IMPORT', 'DOMESTIC', 'UNKNOWN'] satisfies TripDirection[];

export class CreateTripDto {
  @ApiProperty({
    example: 'HN-2026-0001'
  })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  tripCode!: string;

  @ApiProperty({
    enum: tripTypes,
    example: 'EXPORT_WITH_GOODS'
  })
  @IsIn(tripTypes)
  tripType!: TripType;

  @ApiPropertyOptional({
    enum: tripDirections,
    example: 'EXPORT'
  })
  @IsOptional()
  @IsIn(tripDirections)
  direction?: TripDirection;

  @ApiPropertyOptional({
    example: '00000000-0000-4000-8000-000000000010'
  })
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiPropertyOptional({
    example: '00000000-0000-4000-8000-000000000011'
  })
  @IsOptional()
  @IsUUID()
  driverProfileId?: string;

  @ApiPropertyOptional({
    example: '00000000-0000-4000-8000-000000000012'
  })
  @IsOptional()
  @IsUUID()
  shipmentId?: string;

  @ApiPropertyOptional({
    example: '00000000-0000-4000-8000-000000000013'
  })
  @IsOptional()
  @IsUUID()
  customsDeclarationId?: string;

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
    example: '2026-05-04T02:00:00.000Z'
  })
  @IsOptional()
  @IsISO8601()
  plannedStartAt?: string;

  @ApiPropertyOptional({
    example: '2026-05-04T08:00:00.000Z'
  })
  @IsOptional()
  @IsISO8601()
  plannedArrivalAt?: string;
}
