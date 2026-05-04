import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CuaKhauSoLoginDto {
  @ApiProperty({
    example: 'company_user'
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  username!: string;

  @ApiProperty({
    example: '••••••••'
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}
