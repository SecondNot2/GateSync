import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from './current-user.decorator';
import type { RequestUser } from './request-user';
import { SupabaseJwtGuard } from './supabase-jwt.guard';

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard)
@Controller('me')
export class MeController {
  @Get()
  getMe(@CurrentUser() user: RequestUser) {
    return user;
  }
}
