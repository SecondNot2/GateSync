import {
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/request-user';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationsService } from './notifications.service';

/**
 * `/api/v1/notifications` — query and lifecycle endpoints for individual
 * users and organization admins.
 *
 * - **Auth**: protected by {@link SupabaseJwtGuard}. Unauthenticated requests
 *   surface as `code = 'UNAUTHENTICATED'` via the global
 *   `HttpExceptionFilter`.
 * - **List endpoint** (`GET /`): admin (`OWNER`/`ADMIN`) callers see the full
 *   organization scope; non-admin callers see only their own notifications.
 *   See `NotificationsService.listNotifications` for the full filter and
 *   pagination contract.
 * - **Detail endpoint** (`GET /:id`): enforces RBAC on the notification's
 *   `recipientUserId`, the caller's membership role, and the referenced
 *   `tripId` (if any). Returns `FORBIDDEN` when the caller is in the right
 *   organization but lacks rights, and `NOT_FOUND` otherwise.
 *
 * Read / hide endpoints are owned by task 12.2 — the legacy `Patch` and
 * `Delete` handlers below predate that task and remain in place to keep the
 * existing web client working.
 *
 * Design references: Requirements 11.1, 11.2, 11.3.
 */
@ApiTags('notifications')
@ApiBearerAuth()
@ApiExtraModels(ListNotificationsQueryDto)
@UseGuards(SupabaseJwtGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary:
      'List notifications. Admins see the full organization scope; non-admins see only their own inbox.'
  })
  listNotifications(@CurrentUser() user: RequestUser, @Query() query: ListNotificationsQueryDto) {
    return this.notifications.listNotifications(user, query);
  }

  @Get(':notificationId')
  @ApiOperation({
    summary:
      'Read a single notification. Enforces recipient/admin RBAC plus trip access when `tripId` is set.'
  })
  getNotificationDetail(
    @CurrentUser() user: RequestUser,
    @Param('notificationId', new ParseUUIDPipe({ version: '4' })) notificationId: string
  ) {
    return this.notifications.getNotificationDetail(user, notificationId);
  }

  @Patch(':notificationId/read')
  markRead(@CurrentUser() user: RequestUser, @Param('notificationId') notificationId: string) {
    return this.notifications.markRead(user, notificationId);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: RequestUser) {
    return this.notifications.markAllRead(user);
  }

  @Delete()
  clearAll(@CurrentUser() user: RequestUser) {
    return this.notifications.clearAll(user);
  }
}
