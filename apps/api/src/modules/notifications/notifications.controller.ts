import { Controller, Delete, Get, Inject, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/request-user';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  @Get()
  listNotifications(
    @CurrentUser() user: RequestUser,
    @Query('after') after?: string
  ) {
    const afterDate = after ? new Date(after) : undefined;

    return this.notifications.listUserNotifications(user, afterDate);
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
