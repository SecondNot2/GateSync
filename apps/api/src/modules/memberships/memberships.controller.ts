import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { OrganizationMembershipGuard } from '../auth/organization-membership.guard';
import { OrganizationRoles } from '../auth/organization-roles.decorator';
import { OrganizationRolesGuard } from '../auth/organization-roles.guard';
import type { RequestUser } from '../auth/request-user';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';
import { InviteMembershipDto } from './dto/invite-membership.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { MembershipsService } from './memberships.service';

const membershipManagerRoles = ['OWNER', 'ADMIN'] as const;

@ApiTags('memberships')
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard, OrganizationMembershipGuard)
@Controller('organizations/:organizationId/memberships')
export class MembershipsController {
  constructor(@Inject(MembershipsService) private readonly membershipsService: MembershipsService) {}

  @Get()
  listMemberships(@Param('organizationId') organizationId: string) {
    return this.membershipsService.listMemberships(organizationId);
  }

  @Post('invitations')
  @UseGuards(OrganizationRolesGuard)
  @OrganizationRoles(...membershipManagerRoles)
  @ApiBody({ type: InviteMembershipDto })
  createInvitePlaceholder(
    @CurrentUser() user: RequestUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: InviteMembershipDto
  ) {
    return this.membershipsService.createInvitePlaceholder(user, organizationId, dto);
  }

  @Patch(':membershipId')
  @UseGuards(OrganizationRolesGuard)
  @OrganizationRoles(...membershipManagerRoles)
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
