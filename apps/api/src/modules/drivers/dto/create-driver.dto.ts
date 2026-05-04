import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateDriverDto {
  @ApiPropertyOptional({
    example: 'Nguyễn Văn Bình'
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional({
    example: '0988123456'
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({
    example: '790123456789'
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  licenseNumber?: string;

  @ApiPropertyOptional({
    example: '00000000-0000-4000-8000-000000000002'
  })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
