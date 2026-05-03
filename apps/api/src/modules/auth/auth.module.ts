import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { SupabaseJwtGuard } from './supabase-jwt.guard';

@Module({
  controllers: [MeController],
  providers: [SupabaseJwtGuard],
  exports: [SupabaseJwtGuard]
})
export class AuthModule {}
