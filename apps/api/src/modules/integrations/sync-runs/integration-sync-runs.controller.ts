import { Controller, ForbiddenException, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiTags } from '@nestjs/swagger';
import type { MembershipRole } from '@prisma/client';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { RequestUser } from '../../auth/request-user';
import { SupabaseJwtGuard } from '../../auth/supabase-jwt.guard';
import { ListIntegrationSyncRunsQueryDto } from './dto/list-integration-sync-runs-query.dto';
import { IntegrationSyncRunsService } from './integration-sync-runs.service';

/**
 * Roles allowed to read integration sync runs (Requirements 4.2, 4.4).
 *
 * Per the project convention also used by `AuditController`, `OWNER` and
 * `ADMIN` are the canonical "organization admin" roles for tenant-level
 * configuration and integration observability access.
 */
const ADMIN_ROLES: readonly MembershipRole[] = ['OWNER', 'ADMIN'];

/**
 * `GET /api/v1/integration-sync-runs`
 *
 * Admin-only, tenant-scoped sync-run history endpoint.
 *
 * - **Auth**: protected by {@link SupabaseJwtGuard}; an unauthenticated
 *   request results in `UNAUTHENTICATED` (the guard throws
 *   `UnauthorizedException`, which the global `HttpExceptionFilter` maps to
 *   `code = 'UNAUTHENTICATED'`). _Requirement 4.3._
 * - **Authorization**: the caller must hold an ACTIVE membership with role
 *   `OWNER` or `ADMIN`. Without one, the controller throws
 *   `ForbiddenException` → `code = 'FORBIDDEN'`. _Requirement 4.4._ This
 *   endpoint deliberately does NOT use `OrganizationMembershipGuard` because
 *   it is not nested under `/organizations/:organizationId/...` — the active
 *   organization is derived from the resolved request user, not from a
 *   path/query parameter.
 * - **Tenant scope**: `organizationId` is taken from the caller's resolved
 *   admin membership and passed straight into the Prisma `where` clause. The
 *   client cannot influence it; cross-tenant lookups are not possible
 *   through this endpoint. _Requirement 4.2._
 * - **Pagination**: cursor-based, ordered by `startedAt DESC, id DESC`.
 *   _Requirement 4.2._
 *
 * The `NOT_FOUND` error code is reserved for any future single-record
 * sub-route (e.g. `GET /api/v1/integration-sync-runs/:id`); the list
 * endpoint returns an empty page rather than 404 when no rows match
 * (including when the requested `integrationAccountId` does not exist for
 * the caller's organization — see Requirement 4.5: tenant scope means the
 * filter simply matches nothing).
 *
 * Design references: Requirements 4.1, 4.2, 4.3, 4.4, 4.5.
 */
@ApiTags('integration-sync-runs')
@ApiBearerAuth()
@ApiExtraModels(ListIntegrationSyncRunsQueryDto)
@UseGuards(SupabaseJwtGuard)
@Controller('integration-sync-runs')
export class IntegrationSyncRunsController {
  constructor(
    @Inject(IntegrationSyncRunsService)
    private readonly syncRuns: IntegrationSyncRunsService
  ) {}

  @Get()
  listSyncRuns(@CurrentUser() user: RequestUser, @Query() query: ListIntegrationSyncRunsQueryDto) {
    const adminMembership = user.memberships.find(
      (membership) =>
        membership.status === 'ACTIVE' && ADMIN_ROLES.some((role) => role === membership.role)
    );

    if (!adminMembership) {
      throw new ForbiddenException(
        'Bạn cần quyền quản trị tổ chức để xem lịch sử đồng bộ tích hợp.'
      );
    }

    return this.syncRuns.list(adminMembership.organizationId, query);
  }
}
