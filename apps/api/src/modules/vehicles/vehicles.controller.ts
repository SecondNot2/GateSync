import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { OrganizationMembershipGuard } from '../auth/organization-membership.guard';
import { OrganizationRoles } from '../auth/organization-roles.decorator';
import { OrganizationRolesGuard } from '../auth/organization-roles.guard';
import type { RequestUser } from '../auth/request-user';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehiclesService } from './vehicles.service';

const fleetManagerRoles = ['OWNER', 'ADMIN', 'DISPATCHER'] as const;

@ApiTags('vehicles')
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard, OrganizationMembershipGuard)
@Controller('organizations/:organizationId/vehicles')
export class VehiclesController {
  constructor(@Inject(VehiclesService) private readonly vehiclesService: VehiclesService) {}

  @Get()
  listVehicles(@Param('organizationId') organizationId: string) {
    return this.vehiclesService.listVehicles(organizationId);
  }

  @Post()
  @UseGuards(OrganizationRolesGuard)
  @OrganizationRoles(...fleetManagerRoles)
  @ApiBody({ type: CreateVehicleDto })
  createVehicle(
    @CurrentUser() user: RequestUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateVehicleDto
  ) {
    return this.vehiclesService.createVehicle(user, organizationId, dto);
  }

  @Patch(':vehicleId')
  @UseGuards(OrganizationRolesGuard)
  @OrganizationRoles(...fleetManagerRoles)
  @ApiBody({ type: UpdateVehicleDto })
  updateVehicle(
    @CurrentUser() user: RequestUser,
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: UpdateVehicleDto
  ) {
    return this.vehiclesService.updateVehicle(user, organizationId, vehicleId, dto);
  }

  @Delete(':vehicleId')
  @UseGuards(OrganizationRolesGuard)
  @OrganizationRoles(...fleetManagerRoles)
  deleteVehicle(
    @CurrentUser() user: RequestUser,
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string
  ) {
    return this.vehiclesService.deleteVehicle(user, organizationId, vehicleId);
  }
}
