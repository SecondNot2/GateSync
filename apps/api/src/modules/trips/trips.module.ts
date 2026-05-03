import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TripStateTransitionService } from './trip-state-transition.service';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [TripsController],
  providers: [TripsService, TripStateTransitionService]
})
export class TripsModule {}
