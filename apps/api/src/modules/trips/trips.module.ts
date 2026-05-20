import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from '../auth/auth.module';
import { IntegrationSyncQueueModule } from '../integrations/integration-sync-queue.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TripOperationsService } from './trip-operations.service';
import { TripStateTransitionService } from './trip-state-transition.service';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  imports: [
    AuthModule,
    EventEmitterModule.forRoot(),
    IntegrationSyncQueueModule,
    NotificationsModule,
    PrismaModule
  ],
  controllers: [TripsController],
  providers: [TripsService, TripOperationsService, TripStateTransitionService],
  exports: [TripsService]
})
export class TripsModule {}
