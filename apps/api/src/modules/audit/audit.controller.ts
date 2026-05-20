import { Controller, ForbiddenException, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiTags } from '@nestjs/swagger';
import type { MembershipRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/request-user';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';
import { AuditQueryService } from './audit-query.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

/**
 * Roles allowed to read the audit log (Requirements 16.4).
 *
 * Per the project convention used by the memberships service, `OWNER` and
 * `ADMIN` are the canonical "organization admin" roles for tenant-level
 * configuration and audit access.
 */
const ADMIN_ROLES: readonly MembershipRole[] = ['OWNER', 'ADMIN'];

/**
 * `GET /api/v1/audit-logs`
 *
 * Admin-only, tenant-scoped audit log query endpoint.
 *
 * - **Auth**: protected by {@link SupabaseJwtGuard}; an unauthenticated request
 *   results in `UNAUTHENTICATED` (the guard throws `UnauthorizedException`,
 *   which the global `HttpExceptionFilter` maps to `code = 'UNAUTHENTICATED'`).
 * - **Authorization**: the caller must hold an ACTIVE membership with role
 *   `OWNER` or `ADMIN`. Without one, the controller throws
 *   `ForbiddenException` → `code = 'FORBIDDEN'`. This endpoint deliberately
 *   does NOT use `OrganizationMembershipGuard` because it is not nested under
 *   `/organizations/:organizationId/...` — the active organization is derived
 *   from the resolved request user, not from a path/query parameter.
 * - **Tenant scope**: `organizationId` is taken from the caller's resolved
 *   admin membership and passed straight into the Prisma `where` clause. The
 *   client cannot influence it; cross-tenant lookups are not possible through
 *   this endpoint.
 * - **Pagination**: cursor-based, ordered by `createdAt DESC, id DESC`.
 *
 * The `NOT_FOUND` error code is reserved for any future single-record sub-route
 * (e.g. `GET /api/v1/audit-logs/:id`); the list endpoint returns an empty page
 * rather than 404 when no rows match.
 *
 * Design references: Requirements 16.4.
 */
@ApiTags('audit-logs')
@ApiBearerAuth()
@ApiExtraModels(ListAuditLogsQueryDto)
@UseGuards(SupabaseJwtGuard)
@Controller('audit-logs')
export class AuditController {
  constructor(@Inject(AuditQueryService) private readonly auditQuery: AuditQueryService) {}

  @Get()
  listAuditLogs(@CurrentUser() user: RequestUser, @Query() query: ListAuditLogsQueryDto) {
    const adminMembership = user.memberships.find(
      (membership) =>
        membership.status === 'ACTIVE' && ADMIN_ROLES.some((role) => role === membership.role)
    );

    if (!adminMembership) {
      throw new ForbiddenException('Bạn cần quyền quản trị tổ chức để truy vấn audit log.');
    }

    return this.auditQuery.list(adminMembership.organizationId, query);
  }
}
