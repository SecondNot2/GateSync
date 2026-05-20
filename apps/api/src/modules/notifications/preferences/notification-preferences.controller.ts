import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { RequestUser } from '../../auth/request-user';
import { SupabaseJwtGuard } from '../../auth/supabase-jwt.guard';
import { UpsertNotificationPreferencesDto, upsertNotificationPreferencesSchema } from './dto';
import { NotificationPreferencesService } from './notification-preferences.service';

/**
 * Self-only `NotificationPreference` endpoints under `/api/v1/me/...`.
 *
 * Authorization:
 * - `SupabaseJwtGuard` resolves the authenticated `RequestUser`.
 * - `userId` is taken from `RequestUser.id` exclusively — the route never
 *   accepts a `userId` path/query parameter.
 * - The PUT body MAY include `userId`, but only as an explicit assertion
 *   that the client believes it is writing for the authenticated user.
 *   Mismatches are rejected with `FORBIDDEN` (Requirement 10.4).
 * - `organizationId` is supplied by the client (query for GET, body for
 *   PUT) and is verified against the user's active memberships before any
 *   DB work runs.
 */
@ApiTags('notification-preferences')
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard)
@Controller('me/notification-preferences')
export class NotificationPreferencesController {
  constructor(
    @Inject(NotificationPreferencesService)
    private readonly preferences: NotificationPreferencesService
  ) {}

  /**
   * List preferences for the authenticated user, optionally scoped to an
   * organization.
   *
   * `organizationId` is required because preferences are stored per-org
   * (composite unique includes `organizationId`). Asking for "all my
   * preferences" without a tenant scope would invite leaking data across
   * organizations — easier to forbid up front.
   */
  @Get()
  @ApiOperation({
    summary: "List the current user's notification preferences for an organization."
  })
  @ApiQuery({ name: 'organizationId', type: String, required: true, format: 'uuid' })
  list(
    @CurrentUser() user: RequestUser,
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string
  ) {
    this.assertActiveMembership(user, organizationId);
    return this.preferences.findForCurrentUser(user.id, organizationId);
  }

  /**
   * Bulk-upsert preferences for the authenticated user.
   *
   * Pipeline:
   *  1. Zod validate the body shape (`organizationId`, optional `userId`,
   *     `preferences[]`, `(eventType, channel)` uniqueness).
   *  2. Reject cross-user writes (Requirement 10.4) — body `userId` must
   *     match the authenticated user when present.
   *  3. Verify the caller has an active membership in the target
   *     organization.
   *  4. Hand off to the service which performs the upserts in a single
   *     `prisma.$transaction`.
   */
  @Put()
  @ApiOperation({
    summary: "Bulk-upsert the current user's notification preferences (self-only)."
  })
  @ApiBody({ type: UpsertNotificationPreferencesDto })
  upsert(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const parsed = upsertNotificationPreferencesSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; ') || 'Notification preferences payload không hợp lệ.'
      );
    }

    const { organizationId, userId: bodyUserId, preferences } = parsed.data;
    NotificationPreferencesService.assertSameUser(user.id, bodyUserId);
    this.assertActiveMembership(user, organizationId);

    return this.preferences.upsertForCurrentUser(user.id, organizationId, preferences);
  }

  /**
   * Verify the authenticated user has an active membership in the named
   * organization. Returns `FORBIDDEN` rather than `NOT_FOUND` because the
   * caller has already proven their identity — leaking organization
   * existence here is fine (and is the same posture the rest of the
   * notifications module takes).
   */
  private assertActiveMembership(user: RequestUser, organizationId: string): void {
    const membership = user.memberships.find(
      (item) => item.organizationId === organizationId && item.status === 'ACTIVE'
    );
    if (!membership) {
      throw new ForbiddenException('Bạn không có quyền truy cập tổ chức này.');
    }
  }
}
