import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { OrganizationMembershipGuard } from '../auth/organization-membership.guard';
import { OrganizationPermissions } from '../auth/organization-permissions.decorator';
import { OrganizationPermissionsGuard } from '../auth/organization-permissions.guard';
import type { RequestUser } from '../auth/request-user';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehiclesService } from './vehicles.service';

@ApiTags('vehicles')
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard, OrganizationMembershipGuard, OrganizationPermissionsGuard)
@Controller('organizations/:organizationId/vehicles')
export class VehiclesController {
  constructor(@Inject(VehiclesService) private readonly vehiclesService: VehiclesService) {}

  @Get()
  listVehicles(@Param('organizationId') organizationId: string) {
    return this.vehiclesService.listVehicles(organizationId);
  }

  @Post()
  @OrganizationPermissions('fleet:manage')
  @ApiBody({ type: CreateVehicleDto })
  createVehicle(
    @CurrentUser() user: RequestUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateVehicleDto
  ) {
    return this.vehiclesService.createVehicle(user, organizationId, dto);
  }

  @Patch(':vehicleId')
  @OrganizationPermissions('fleet:manage')
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
  @OrganizationPermissions('fleet:manage')
  deleteVehicle(
    @CurrentUser() user: RequestUser,
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string
  ) {
    return this.vehiclesService.deleteVehicle(user, organizationId, vehicleId);
  }
}
