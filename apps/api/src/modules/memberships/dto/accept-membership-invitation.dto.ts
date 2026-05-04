import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AcceptMembershipInvitationDto {
  @ApiProperty({
    example: 'GS-4A7C-91EF-B302'
  })
  @IsString()
  @MinLength(8)
  code!: string;
}
