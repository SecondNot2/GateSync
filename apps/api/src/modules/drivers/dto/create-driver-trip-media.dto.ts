import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsISO8601, IsObject, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';

const tripMediaTypes = ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'OTHER'] as const;

export class CreateDriverTripMediaDto {
  @ApiProperty({
    enum: tripMediaTypes,
    example: 'IMAGE'
  })
  @IsIn(tripMediaTypes)
  mediaType!: (typeof tripMediaTypes)[number];

  @ApiProperty({
    example: 'seal-photo.jpg'
  })
  @IsString()
  @MaxLength(180)
  fileName!: string;

  @ApiPropertyOptional({
    example: 'image/jpeg'
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimeType?: string;

  @ApiPropertyOptional({
    example: 'trip-media/org-id/trip-id/seal-photo.jpg'
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  storagePath?: string;

  @ApiPropertyOptional({
    example: 'https://example.supabase.co/storage/v1/object/sign/trip-media/...'
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(1000)
  publicUrl?: string;

  @ApiPropertyOptional({
    example: 240128
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200_000_000)
  sizeBytes?: number;

  @ApiPropertyOptional({
    example: 'Ảnh niêm phong sau khi vào bãi.'
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @ApiPropertyOptional({
    example: '2026-05-05T08:30:00.000Z'
  })
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @ApiPropertyOptional({
    example: {
      category: 'proof',
      source: 'driver_portal'
    }
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
