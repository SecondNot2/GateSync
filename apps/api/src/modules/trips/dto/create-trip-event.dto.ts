import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min
} from 'class-validator';
import type { TripEventSource, TripEventType } from '@prisma/client';

const tripEventTypes = [
  'TRIP_CREATED',
  'VEHICLE_ASSIGNED',
  'DRIVER_ASSIGNED',
  'DEPARTED',
  'ARRIVED_BORDER_AREA',
  'WAITING_YARD_ENTRY',
  'YARD_ENTRY_CONFIRMED',
  'DRIVER_REPORTED_YARD_ENTRY',
  'YARD_EXIT_CONFIRMED',
  'DRIVER_REPORTED_GATE_ENTRY',
  'DECLARATION_SUBMITTED',
  'DECLARATION_APPROVED',
  'DECLARATION_REJECTED',
  'BORDER_GATE_ENTRY_CONFIRMED',
  'CUSTOMS_PROCESSING',
  'INSPECTION_REQUIRED',
  'INSPECTION_COMPLETED',
  'FEE_PAID',
  'BORDER_GATE_EXIT_CONFIRMED',
  'TRANSSHIPMENT_ELIGIBLE',
  'TRANSSHIPMENT_SIGNED',
  'TRANSSHIPMENT_STARTED',
  'TRANSSHIPMENT_COMPLETED',
  'DRIVER_LOCATION_SHARED',
  'DRIVER_MEDIA_UPLOADED',
  'RELEASE_READY',
  'RELEASE_REQUESTED',
  'VEHICLE_RELEASED',
  'PROOF_IMAGE_UPLOADED',
  'DRIVER_NOTE_ADDED',
  'TRIP_CANCELLED',
  'TRIP_COMPLETED'
] as const;

const tripEventSources = [
  'MANUAL',
  'DRIVER_APP',
  'IMPORT',
  'CUA_KHAU_SO',
  'XUAN_CUONG',
  'GPS',
  'SYSTEM',
  'AI_ASSISTANT'
] satisfies TripEventSource[];

export class CreateTripEventDto {
  @ApiProperty({
    enum: tripEventTypes,
    example: 'YARD_ENTRY_CONFIRMED'
  })
  @IsIn(tripEventTypes)
  eventType!: TripEventType;

  @ApiProperty({
    example: '2026-05-04T08:30:00.000Z'
  })
  @IsISO8601()
  occurredAt!: string;

  @ApiPropertyOptional({
    enum: tripEventSources,
    example: 'MANUAL'
  })
  @IsOptional()
  @IsIn(tripEventSources)
  source?: TripEventSource;

  @ApiPropertyOptional({
    example: 'yard-confirmation-123'
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  sourceRef?: string;

  @ApiPropertyOptional({
    example: 'Đã xác nhận xe vào bãi Xuân Cương.'
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({
    example: 0.95
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiPropertyOptional({
    example: { operator: 'field-team' }
  })
  @IsOptional()
  @IsObject()
  rawPayload?: Record<string, unknown>;
}
