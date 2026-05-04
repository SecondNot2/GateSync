import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class SyncCuaKhauSoDeclarationDto {
  @ApiPropertyOptional({
    example: '00000000-0000-4000-8000-000000000020'
  })
  @IsOptional()
  @IsUUID()
  tripId?: string;
}
