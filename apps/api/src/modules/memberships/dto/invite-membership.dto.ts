import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn } from 'class-validator';
import type { MembershipRole } from '@prisma/client';

const inviteRoles = [
  'ADMIN',
  'DISPATCHER',
  'DOCUMENT_STAFF',
  'FIELD_OPERATOR',
  'VIEWER',
  'BILLING_ADMIN'
] satisfies MembershipRole[];

export class InviteMembershipDto {
  @ApiProperty({
    example: 'dispatcher@gatesync.local'
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    enum: inviteRoles,
    example: 'DISPATCHER'
  })
  @IsIn(inviteRoles)
  role!: MembershipRole;
}
