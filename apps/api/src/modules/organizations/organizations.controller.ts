import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { OrganizationMembershipGuard } from '../auth/organization-membership.guard';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';
import type { RequestUser } from '../auth/request-user';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(
    @Inject(OrganizationsService) private readonly organizationsService: OrganizationsService
  ) {}

  @Get()
  listOrganizations(@CurrentUser() user: RequestUser) {
    return this.organizationsService.listForUser(user);
  }

  @Post()
  @ApiBody({ type: CreateOrganizationDto })
  createOrganization(@CurrentUser() user: RequestUser, @Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(user, dto);
  }

  @Get(':organizationId')
  @UseGuards(OrganizationMembershipGuard)
  getOrganization(
    @CurrentUser() user: RequestUser,
    @Param('organizationId') organizationId: string
  ) {
    return this.organizationsService.getById(user, organizationId);
  }
}
