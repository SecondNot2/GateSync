import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import type { MembershipRole, MembershipStatus } from '@prisma/client';

const membershipRoles = [
  'OWNER',
  'ADMIN',
  'DISPATCHER',
  'DOCUMENT_STAFF',
  'FIELD_OPERATOR',
  'VIEWER',
  'BILLING_ADMIN'
] satisfies MembershipRole[];

const membershipStatuses = ['ACTIVE', 'INVITED', 'SUSPENDED', 'REMOVED'] satisfies MembershipStatus[];

export class UpdateMembershipDto {
  @ApiPropertyOptional({
    enum: membershipRoles,
    example: 'DISPATCHER'
  })
  @IsOptional()
  @IsIn(membershipRoles)
  role?: MembershipRole;

  @ApiPropertyOptional({
    enum: membershipStatuses,
    example: 'ACTIVE'
  })
  @IsOptional()
  @IsIn(membershipStatuses)
  status?: MembershipStatus;
}
