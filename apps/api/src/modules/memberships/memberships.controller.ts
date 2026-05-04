import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { OrganizationMembershipGuard } from '../auth/organization-membership.guard';
import { OrganizationPermissions } from '../auth/organization-permissions.decorator';
import { OrganizationPermissionsGuard } from '../auth/organization-permissions.guard';
import type { RequestUser } from '../auth/request-user';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';
import { AcceptMembershipInvitationDto } from './dto/accept-membership-invitation.dto';
import { InviteMembershipDto } from './dto/invite-membership.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { MembershipsService } from './memberships.service';

@ApiTags('memberships')
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard, OrganizationMembershipGuard, OrganizationPermissionsGuard)
@Controller('organizations/:organizationId/memberships')
export class MembershipsController {
  constructor(
    @Inject(MembershipsService) private readonly membershipsService: MembershipsService
  ) {}

  @Get()
  listMemberships(@Param('organizationId') organizationId: string) {
    return this.membershipsService.listMemberships(organizationId);
  }

  @Post('invitations')
  @OrganizationPermissions('memberships:manage')
  @ApiBody({ type: InviteMembershipDto })
  createInvitation(
    @CurrentUser() user: RequestUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: InviteMembershipDto
  ) {
    return this.membershipsService.createInvitation(user, organizationId, dto);
  }

  @Patch(':membershipId')
  @OrganizationPermissions('memberships:manage')
  @ApiBody({ type: UpdateMembershipDto })
  updateMembership(
    @CurrentUser() user: RequestUser,
    @Param('organizationId') organizationId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMembershipDto
  ) {
    return this.membershipsService.updateMembership(user, organizationId, membershipId, dto);
  }
}

@ApiTags('membership-invitations')
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard)
@Controller('membership-invitations')
export class MembershipInvitationsController {
  constructor(
    @Inject(MembershipsService) private readonly membershipsService: MembershipsService
  ) {}

  @Post('accept')
  @ApiBody({ type: AcceptMembershipInvitationDto })
  acceptInvitation(@CurrentUser() user: RequestUser, @Body() dto: AcceptMembershipInvitationDto) {
    return this.membershipsService.acceptInvitation(user, dto);
  }
}
