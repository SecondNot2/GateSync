import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { OrganizationType } from '@prisma/client';

const organizationTypes = [
  'LOGISTICS_COMPANY',
  'CARGO_OWNER',
  'CUSTOMS_AGENT',
  'TRANSPORT_COMPANY',
  'YARD_OPERATOR',
  'OTHER'
] satisfies OrganizationType[];

export class CreateOrganizationDto {
  @ApiProperty({
    example: 'Công ty Logistics Hữu Nghị'
  })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({
    enum: organizationTypes,
    example: 'LOGISTICS_COMPANY'
  })
  @IsOptional()
  @IsIn(organizationTypes)
  type?: OrganizationType;

  @ApiPropertyOptional({
    example: '0109988776'
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  taxCode?: string;

  @ApiPropertyOptional({
    example: '+84988123456'
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({
    example: 'ops@gatesync.vn'
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional({
    example: 'Lạng Sơn, Việt Nam'
  })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string;
}
