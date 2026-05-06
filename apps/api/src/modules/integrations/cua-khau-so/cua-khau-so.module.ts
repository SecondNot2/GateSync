import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { TripsModule } from '../../trips/trips.module';
import { CuaKhauSoClient } from './cua-khau-so.client';
import { CuaKhauSoController } from './cua-khau-so.controller';
import { CuaKhauSoMapper } from './cua-khau-so.mapper';
import { CuaKhauSoPollingService } from './cua-khau-so-polling.service';
import { CuaKhauSoService } from './cua-khau-so.service';
import { CuaKhauSoSessionStore } from './cua-khau-so-session.store';

@Module({
  imports: [AuthModule, NotificationsModule, PrismaModule, TripsModule],
  controllers: [CuaKhauSoController],
  providers: [
    CuaKhauSoClient,
    CuaKhauSoMapper,
    CuaKhauSoPollingService,
    CuaKhauSoService,
    CuaKhauSoSessionStore
  ]
})
export class CuaKhauSoModule {}
