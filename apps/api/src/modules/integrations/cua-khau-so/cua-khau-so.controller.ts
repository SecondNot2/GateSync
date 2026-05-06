import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiExtraModels, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/current-user.decorator';
import { OrganizationMembershipGuard } from '../../auth/organization-membership.guard';
import { OrganizationPermissions } from '../../auth/organization-permissions.decorator';
import { OrganizationPermissionsGuard } from '../../auth/organization-permissions.guard';
import type { RequestUser } from '../../auth/request-user';
import { SupabaseJwtGuard } from '../../auth/supabase-jwt.guard';
import { CuaKhauSoService } from './cua-khau-so.service';
import { CuaKhauSoLoginDto } from './dto/cua-khau-so-login.dto';
import { ListCuaKhauSoDeclarationsQueryDto } from './dto/list-cua-khau-so-declarations-query.dto';
import { SyncCuaKhauSoDeclarationDto } from './dto/sync-cua-khau-so-declaration.dto';

@ApiTags('integrations-cua-khau-so')
@ApiBearerAuth()
@ApiExtraModels(ListCuaKhauSoDeclarationsQueryDto)
@UseGuards(SupabaseJwtGuard, OrganizationMembershipGuard, OrganizationPermissionsGuard)
@OrganizationPermissions('integrations:cua-khau-so:read')
@Controller('organizations/:organizationId/integrations/cua-khau-so')
export class CuaKhauSoController {
  constructor(@Inject(CuaKhauSoService) private readonly cuaKhauSoService: CuaKhauSoService) {}

  @Get('session')
  getSession(@CurrentUser() user: RequestUser, @Param('organizationId') organizationId: string) {
    return this.cuaKhauSoService.getSession(user, organizationId);
  }

  @Post('session')
  @OrganizationPermissions('integrations:cua-khau-so:connect')
  @ApiBody({ type: CuaKhauSoLoginDto })
  connect(
    @CurrentUser() user: RequestUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: CuaKhauSoLoginDto
  ) {
    return this.cuaKhauSoService.connect(user, organizationId, dto);
  }

  @Get('declarations')
  listDeclarations(
    @CurrentUser() user: RequestUser,
    @Param('organizationId') organizationId: string,
    @Query() query: ListCuaKhauSoDeclarationsQueryDto
  ) {
    return this.cuaKhauSoService.listDeclarations(user, organizationId, query);
  }

  @Get('sync-runs')
  @OrganizationPermissions('integrations:cua-khau-so:sync')
  listSyncRuns(@Param('organizationId') organizationId: string) {
    return this.cuaKhauSoService.listSyncRuns(organizationId);
  }

  @Get('health')
  getHealth(@Param('organizationId') organizationId: string) {
    return this.cuaKhauSoService.getHealth(organizationId);
  }

  @Post('sync-runs')
  @OrganizationPermissions('integrations:cua-khau-so:sync')
  runSyncNow(@CurrentUser() user: RequestUser, @Param('organizationId') organizationId: string) {
    return this.cuaKhauSoService.runSyncNow(user, organizationId);
  }

  @Get('declarations/:externalId')
  getDeclaration(
    @CurrentUser() user: RequestUser,
    @Param('organizationId') organizationId: string,
    @Param('externalId') externalId: string
  ) {
    return this.cuaKhauSoService.getDeclaration(user, organizationId, externalId);
  }

  @Get('declarations/:externalId/steps')
  getProcedureSteps(
    @CurrentUser() user: RequestUser,
    @Param('organizationId') organizationId: string,
    @Param('externalId') externalId: string
  ) {
    return this.cuaKhauSoService.getProcedureSteps(user, organizationId, externalId);
  }

  @Post('declarations/:externalId/sync')
  @OrganizationPermissions('integrations:cua-khau-so:sync')
  @ApiBody({ type: SyncCuaKhauSoDeclarationDto })
  syncDeclaration(
    @CurrentUser() user: RequestUser,
    @Param('organizationId') organizationId: string,
    @Param('externalId') externalId: string,
    @Body() dto: SyncCuaKhauSoDeclarationDto
  ) {
    return this.cuaKhauSoService.syncDeclaration(user, organizationId, externalId, dto);
  }
}
