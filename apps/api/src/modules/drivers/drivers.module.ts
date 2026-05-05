import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TripsModule } from '../trips/trips.module';
import { DriverPortalController } from './driver-portal.controller';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

@Module({
  imports: [AuthModule, PrismaModule, TripsModule],
  controllers: [DriverPortalController, DriversController],
  providers: [DriversService]
})
export class DriversModule {}
