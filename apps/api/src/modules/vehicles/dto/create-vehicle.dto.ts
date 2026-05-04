import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { OwnershipType, VehicleType } from '@prisma/client';

const vehicleTypes = [
  'TRUCK',
  'TRACTOR_HEAD',
  'TRAILER',
  'CONTAINER_TRUCK',
  'VAN',
  'OTHER'
] satisfies VehicleType[];

const ownershipTypes = ['OWNED', 'LEASED', 'PARTNER', 'CUSTOMER', 'OTHER'] satisfies OwnershipType[];

export class CreateVehicleDto {
  @ApiProperty({
    example: '29H-12345'
  })
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  plateNumber!: string;

  @ApiProperty({
    enum: vehicleTypes,
    example: 'CONTAINER_TRUCK'
  })
  @IsIn(vehicleTypes)
  vehicleType!: VehicleType;

  @ApiPropertyOptional({
    enum: ownershipTypes,
    example: 'OWNED'
  })
  @IsOptional()
  @IsIn(ownershipTypes)
  ownershipType?: OwnershipType;

  @ApiPropertyOptional({
    example: '00000000-0000-4000-8000-000000000011'
  })
  @IsOptional()
  @IsUUID()
  defaultDriverId?: string;
}
