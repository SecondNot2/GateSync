import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/request-user';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';
import { CreateDriverTripMediaDto } from './dto/create-driver-trip-media.dto';
import { DriversService } from './drivers.service';

@ApiTags('driver-portal')
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard)
@Controller('me/driver')
export class DriverPortalController {
  constructor(@Inject(DriversService) private readonly driversService: DriversService) {}

  @Get('trips')
  listAssignedTrips(@CurrentUser() user: RequestUser) {
    return this.driversService.listAssignedTripsForDriver(user);
  }

  @Post('trips/:tripId/media')
  @ApiBody({ type: CreateDriverTripMediaDto })
  uploadTripMedia(
    @CurrentUser() user: RequestUser,
    @Param('tripId') tripId: string,
    @Body() dto: CreateDriverTripMediaDto
  ) {
    return this.driversService.createDriverTripMedia(user, tripId, dto);
  }
}
