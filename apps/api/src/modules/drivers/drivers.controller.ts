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
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { DriversService } from './drivers.service';

@ApiTags('drivers')
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard, OrganizationMembershipGuard, OrganizationPermissionsGuard)
@Controller('organizations/:organizationId/drivers')
export class DriversController {
  constructor(@Inject(DriversService) private readonly driversService: DriversService) {}

  @Get()
  listDrivers(@Param('organizationId') organizationId: string) {
    return this.driversService.listDrivers(organizationId);
  }

  @Post()
  @OrganizationPermissions('fleet:manage')
  @ApiBody({ type: CreateDriverDto })
  createDriver(
    @CurrentUser() user: RequestUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateDriverDto
  ) {
    return this.driversService.createDriver(user, organizationId, dto);
  }

  @Patch(':driverProfileId')
  @OrganizationPermissions('fleet:manage')
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
  @OrganizationPermissions('fleet:manage')
  deleteDriver(
    @CurrentUser() user: RequestUser,
    @Param('organizationId') organizationId: string,
    @Param('driverProfileId') driverProfileId: string
  ) {
    return this.driversService.deleteDriver(user, organizationId, driverProfileId);
  }
}
