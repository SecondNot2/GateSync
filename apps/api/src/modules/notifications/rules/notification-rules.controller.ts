import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { RequestUser } from '../../auth/request-user';
import { SupabaseJwtGuard } from '../../auth/supabase-jwt.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationRulesService } from './notification-rules.service';

/**
 * Admin-only REST controller for `NotificationRule` CRUD.
 *
 * The endpoint is mounted flat at `/api/v1/notification-rules` per the
 * design's admin-portal URL scheme (not nested under
 * `organizations/:organizationId/...`). Two strategies are used to recover
 * the tenant context that the flat URL omits:
 *
 *  - `GET /` and `POST /` accept `organizationId` as a query parameter and
 *    body field respectively. The service's `assertAdmin` then validates
 *    the caller is an admin in that organization.
 *  - `GET /:id`, `PATCH /:id`, `DELETE /:id` resolve the tenant from the
 *    rule's own `organizationId` after a tenant-blind lookup, then run the
 *    same admin assertion.
 *
 * Authentication is enforced by `SupabaseJwtGuard`. Role checks live in the
 * service so they remain consistent regardless of how a route is composed.
 */
@ApiTags('notification-rules')
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard)
@Controller('notification-rules')
export class NotificationRulesController {
  constructor(
    @Inject(NotificationRulesService) private readonly rules: NotificationRulesService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  /**
   * List active rules for the requested organization.
   *
   * `organizationId` is taken from the query string so the same controller
   * works for admins managing multiple organizations from a single signed-in
   * session.
   */
  @Get()
  @ApiOperation({ summary: 'List notification rules for an organization (admin-only).' })
  @ApiQuery({ name: 'organizationId', type: String, required: true, format: 'uuid' })
  list(
    @CurrentUser() user: RequestUser,
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string
  ) {
    return this.rules.list(user, organizationId);
  }

  /**
   * Create a new rule. The body MUST include `organizationId` so the service
   * can route the create into the correct tenant before any DB work begins.
   */
  @Post()
  @ApiOperation({ summary: 'Create a notification rule (admin-only).' })
  async create(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const organizationId = this.extractOrganizationId(body);
    return this.rules.create(user, organizationId, body);
  }

  /**
   * Read a single rule by id. The tenant is resolved from the rule itself.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Read a single notification rule (admin-only).' })
  async getById(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string
  ) {
    const organizationId = await this.resolveOrganizationFromRule(id);
    return this.rules.getById(user, organizationId, id);
  }

  /**
   * Partially update a rule. The body MUST NOT change the rule's
   * `organizationId`; we resolve the tenant from the persisted row and
   * silently strip any conflicting `organizationId` from the payload before
   * forwarding it to the service.
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Update a notification rule (admin-only).' })
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown
  ) {
    const organizationId = await this.resolveOrganizationFromRule(id);
    const sanitized = this.stripOrganizationId(body);
    return this.rules.update(user, organizationId, id, sanitized);
  }

  /**
   * Soft-delete a rule. Returns the updated row so admin UIs can present the
   * `deletedAt` timestamp without a follow-up read.
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a notification rule (admin-only).' })
  async softDelete(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string
  ) {
    const organizationId = await this.resolveOrganizationFromRule(id);
    return this.rules.softDelete(user, organizationId, id);
  }

  /**
   * Look up a rule by id without applying tenant scoping, then return its
   * `organizationId` so the caller can run the admin guard against it. We
   * intentionally do not include `deletedAt: null` here so callers acting on
   * an already-deleted rule still get a `NOT_FOUND` from the service layer
   * (rather than two different error paths for "missing" vs "deleted").
   */
  private async resolveOrganizationFromRule(id: string): Promise<string> {
    const row = await this.prisma.notificationRule.findUnique({
      where: { id },
      select: { organizationId: true }
    });
    if (!row) {
      throw new NotFoundException('Không tìm thấy notification rule.');
    }
    return row.organizationId;
  }

  /**
   * Extract `organizationId` from a request body without trusting that the
   * body is an object. Throws `VALIDATION_ERROR` when the field is missing
   * or not a UUID-shaped string. Full Zod validation of the rest of the
   * payload happens in the service.
   */
  private extractOrganizationId(body: unknown): string {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Body phải là object chứa organizationId.');
    }
    const candidate = (body as Record<string, unknown>).organizationId;
    if (typeof candidate !== 'string' || !UUID_RE.test(candidate)) {
      throw new BadRequestException('organizationId phải là UUID hợp lệ.');
    }
    return candidate;
  }

  /**
   * Drop `organizationId` from PATCH bodies. Tenant is always derived from
   * the persisted rule (see {@link resolveOrganizationFromRule}); allowing
   * a body field would create a confusing "which one wins?" surface and an
   * obvious tenant-move escape hatch. Reject explicitly so misuse fails
   * loudly.
   */
  private stripOrganizationId(body: unknown): unknown {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return body;
    }
    const source = body as Record<string, unknown>;
    if ('organizationId' in source) {
      throw new ForbiddenException('Không được phép thay đổi organizationId của rule.');
    }
    return body;
  }
}

/**
 * RFC 4122 v4-ish UUID regex. We accept any version because the rest of the
 * codebase uses v4 by default but third-party identifiers occasionally land
 * here unchanged.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
