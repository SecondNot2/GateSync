import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { OrganizationMembershipGuard } from '../auth/organization-membership.guard';
import { OrganizationRoles } from '../auth/organization-roles.decorator';
import { OrganizationRolesGuard } from '../auth/organization-roles.guard';
import type { RequestUser } from '../auth/request-user';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { DriversService } from './drivers.service';

const fleetManagerRoles = ['OWNER', 'ADMIN', 'DISPATCHER'] as const;

@ApiTags('drivers')
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard, OrganizationMembershipGuard)
@Controller('organizations/:organizationId/drivers')
export class DriversController {
  constructor(@Inject(DriversService) private readonly driversService: DriversService) {}

  @Get()
  listDrivers(@Param('organizationId') organizationId: string) {
    return this.driversService.listDrivers(organizationId);
  }

  @Post()
  @UseGuards(OrganizationRolesGuard)
  @OrganizationRoles(...fleetManagerRoles)
  @ApiBody({ type: CreateDriverDto })
  createDriver(
    @CurrentUser() user: RequestUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateDriverDto
  ) {
    return this.driversService.createDriver(user, organizationId, dto);
  }

  @Patch(':driverProfileId')
  @UseGuards(OrganizationRolesGuard)
  @OrganizationRoles(...fleetManagerRoles)
  @ApiBody({ type: UpdateDriverDto })
  updateDriver(
    @CurrentUser() user: RequestUser,
    @Param('organizationId') organizationId: string,
    @Param('driverProfileId') driverProfileId: string,
    @Body() dto: UpdateDriverDto
  ) {
    return this.driversService.updateDriver(user, organizationId, driverProfileId, dto);
  }

  @Delete(':driverProfileId')
  @UseGuards(OrganizationRolesGuard)
  @OrganizationRoles(...fleetManagerRoles)
  deleteDriver(
    @CurrentUser() user: RequestUser,
    @Param('organizationId') organizationId: string,
    @Param('driverProfileId') driverProfileId: string
  ) {
    return this.driversService.deleteDriver(user, organizationId, driverProfileId);
  }
}
