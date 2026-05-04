import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrganizationMembershipGuard } from '../auth/organization-membership.guard';
import { OrganizationPermissions } from '../auth/organization-permissions.decorator';
import { OrganizationPermissionsGuard } from '../auth/organization-permissions.guard';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard, OrganizationMembershipGuard, OrganizationPermissionsGuard)
@OrganizationPermissions('trips:read')
@Controller('organizations/:organizationId/dashboard')
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(@Param('organizationId') organizationId: string) {
    return this.dashboardService.getSummary(organizationId);
  }
}
