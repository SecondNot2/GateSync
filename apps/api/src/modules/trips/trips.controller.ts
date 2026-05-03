import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiExtraModels, ApiHeader, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { OrganizationMembershipGuard } from '../auth/organization-membership.guard';
import { OrganizationRoles } from '../auth/organization-roles.decorator';
import { OrganizationRolesGuard } from '../auth/organization-roles.guard';
import type { RequestUser } from '../auth/request-user';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';
import { CreateTripEventDto } from './dto/create-trip-event.dto';
import { CreateTripDto } from './dto/create-trip.dto';
import { ListTripsQueryDto } from './dto/list-trips-query.dto';
import { TripsService } from './trips.service';

const tripManagerRoles = [
  'OWNER',
  'ADMIN',
  'DISPATCHER',
  'DOCUMENT_STAFF',
  'FIELD_OPERATOR'
] as const;

@ApiTags('trips')
@ApiBearerAuth()
@ApiExtraModels(ListTripsQueryDto)
@UseGuards(SupabaseJwtGuard, OrganizationMembershipGuard)
@Controller('organizations/:organizationId/trips')
export class TripsController {
  constructor(@Inject(TripsService) private readonly tripsService: TripsService) {}

  @Get()
  listTrips(@Param('organizationId') organizationId: string, @Query() query: ListTripsQueryDto) {
    return this.tripsService.listTrips(organizationId, query);
  }

  @Post()
  @UseGuards(OrganizationRolesGuard)
  @OrganizationRoles(...tripManagerRoles)
  @ApiBody({ type: CreateTripDto })
  createTrip(
    @CurrentUser() user: RequestUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateTripDto
  ) {
    return this.tripsService.createTrip(user, organizationId, dto);
  }

  @Get(':tripId')
  getTrip(@Param('organizationId') organizationId: string, @Param('tripId') tripId: string) {
    return this.tripsService.getTrip(organizationId, tripId);
  }

  @Get(':tripId/events')
  listEvents(@Param('organizationId') organizationId: string, @Param('tripId') tripId: string) {
    return this.tripsService.listEvents(organizationId, tripId);
  }

  @Post(':tripId/events')
  @UseGuards(OrganizationRolesGuard)
  @OrganizationRoles(...tripManagerRoles)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false
  })
  @ApiBody({ type: CreateTripEventDto })
  createEvent(
    @CurrentUser() user: RequestUser,
    @Param('organizationId') organizationId: string,
    @Param('tripId') tripId: string,
    @Body() dto: CreateTripEventDto,
    @Headers('idempotency-key') idempotencyKey?: string
  ) {
    return this.tripsService.createEvent(user, organizationId, tripId, dto, idempotencyKey);
  }
}
