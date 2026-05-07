import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AuthModule } from './modules/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { OperationsCacheModule } from './modules/cache/operations-cache.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { TripsModule } from './modules/trips/trips.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),
    PrismaModule,
    AuthModule,
    DashboardModule,
    DriversModule,
    IntegrationsModule,
    MembershipsModule,
    NotificationsModule,
    OperationsCacheModule,
    OrganizationsModule,
    TripsModule,
    VehiclesModule
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiResponseInterceptor
    }
  ]
})
export class AppModule {}
