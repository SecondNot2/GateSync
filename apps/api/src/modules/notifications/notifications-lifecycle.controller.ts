import {
  Controller,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/request-user';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';
import { NotificationsLifecycleService } from './notifications-lifecycle.service';

/**
 * Lifecycle endpoints for a single notification (self-only).
 *
 * Kept in a dedicated controller to avoid edit conflicts with the
 * existing `NotificationsController` (legacy `PATCH .../read` and list
 * endpoints) and the upcoming query controller in task 12.1. The
 * lifecycle endpoints follow the spec wording exactly:
 *
 *   POST /api/v1/notifications/:id/read   -> mark as READ
 *   POST /api/v1/notifications/:id/hide   -> hide from inbox
 *
 * Authorization is enforced inside `NotificationsLifecycleService`:
 * `FORBIDDEN` on cross-user mutation attempts within the same tenant,
 * `NOT_FOUND` for missing rows or rows in another tenant.
 *
 * The legacy `PATCH /:notificationId/read` endpoint stays in
 * `NotificationsController` for backwards compatibility; both paths
 * resolve to the same persisted state.
 */
@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard)
@Controller('notifications')
export class NotificationsLifecycleController {
  constructor(
    @Inject(NotificationsLifecycleService)
    private readonly lifecycle: NotificationsLifecycleService
  ) {}

  @Post(':id/read')
  @HttpCode(200)
  async markRead(@CurrentUser() user: RequestUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.lifecycle.markRead(user, id);
  }

  @Post(':id/hide')
  @HttpCode(200)
  async hide(@CurrentUser() user: RequestUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.lifecycle.hide(user, id);
  }
}
