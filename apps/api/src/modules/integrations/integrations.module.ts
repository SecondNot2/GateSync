import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TripsModule } from '../trips/trips.module';
import { TripsService } from '../trips/trips.service';
import { CuaKhauSoMapper } from './cua-khau-so/cua-khau-so.mapper';
import { CuaKhauSoModule } from './cua-khau-so/cua-khau-so.module';
import { GpsMapper } from './gps/gps.mapper';
import { GpsModule } from './gps/gps.module';
import { MockMapper } from './mock/mock.mapper';
import { MockModule } from './mock/mock.module';
import {
  InMemoryProviderAdapterRegistry,
  PROVIDER_ADAPTERS,
  type ProviderAdapterRegistry
} from './provider-adapter-registry';
import { SyncLogRetentionService } from './sync-log-retention.service';
import { SyncSchedulerService } from './sync-scheduler.service';
import { SyncWorkerService } from './sync-worker.service';
import { IntegrationSyncRunsController } from './sync-runs/integration-sync-runs.controller';
import { IntegrationSyncRunsService } from './sync-runs/integration-sync-runs.service';
import {
  TRIP_EVENT_APPLY_PORT,
  type TripEventApplyContext,
  type TripEventApplyOutcome,
  type TripEventApplyPort,
  type TripEventApplyResult
} from './trip-event-apply.port';
import { YardMapper } from './yard/yard.mapper';
import { YardModule } from './yard/yard.module';
import type { TripEventCommand } from './adapters/provider-adapter';

/**
 * IntegrationsModule
 *
 * Wires the AUTO SYNC pipeline (scheduler + worker + provider adapters) and
 * the existing `IntegrationSyncRuns` REST surface. Concrete provider
 * mappers are owned by their dedicated feature modules and surfaced here
 * via the `PROVIDER_ADAPTERS` registry, which the worker resolves at
 * runtime to dispatch fetch/map per `IntegrationProvider`.
 *
 * The {@link TRIP_EVENT_APPLY_PORT} factory adapts {@link TripsService.applyCommands}
 * (task 6.1) into the narrow {@link TripEventApplyPort} contract consumed by
 * `SyncWorkerService` so the worker only depends on the port, not the full
 * trip module.
 *
 * `ScheduleModule.forRoot()` is registered here so `@Cron` decorators on
 * `SyncSchedulerService` (and any future cron jobs in this module) are
 * picked up.
 *
 * Validates: Requirements 1.x, 2.x, 3.x, 13.x
 */
@Module({
  imports: [
    AuthModule,
    PrismaModule,
    ScheduleModule.forRoot(),
    CuaKhauSoModule,
    YardModule,
    GpsModule,
    MockModule,
    TripsModule
  ],
  controllers: [IntegrationSyncRunsController],
  providers: [
    IntegrationSyncRunsService,
    SyncLogRetentionService,
    SyncSchedulerService,
    SyncWorkerService,
    {
      provide: PROVIDER_ADAPTERS,
      useFactory: (
        cks: CuaKhauSoMapper,
        yard: YardMapper,
        gps: GpsMapper,
        mock: MockMapper
      ): ProviderAdapterRegistry =>
        new InMemoryProviderAdapterRegistry([
          ['CUA_KHAU_SO', cks],
          ['XUAN_CUONG', yard],
          ['GPS_PROVIDER', gps],
          ['MOCK', mock]
        ]),
      inject: [CuaKhauSoMapper, YardMapper, GpsMapper, MockMapper]
    },
    {
      provide: TRIP_EVENT_APPLY_PORT,
      useFactory: (tripsService: TripsService): TripEventApplyPort => ({
        applyCommand: async (
          commands: TripEventCommand[],
          ctx: TripEventApplyContext
        ): Promise<TripEventApplyResult> => {
          if (!ctx.syncRunId) {
            // Without a sync run id we cannot increment counters atomically.
            // The worker always supplies one; this guard surfaces misuse early.
            throw new Error('TRIP_EVENT_APPLY_PORT requires ctx.syncRunId');
          }
          const result = await tripsService.applyCommands(commands, {
            id: ctx.syncRunId,
            recordsRejected: 0
          });

          // Index committed events by idempotencyKey so we can produce the
          // per-command outcomes the port contract requires. Anything not
          // committed within this batch was deduplicated by an existing row.
          const committedByKey = new Map(
            result.committedEvents.map((entry) => [entry.command.idempotencyKey, entry])
          );

          const outcomes: TripEventApplyOutcome[] = commands.map((command) => {
            const committed = committedByKey.get(command.idempotencyKey);
            if (committed) {
              return {
                kind: 'created',
                idempotencyKey: command.idempotencyKey,
                tripEventId: committed.event.id
              };
            }
            return {
              kind: 'skipped',
              idempotencyKey: command.idempotencyKey,
              // No trip event id available without an extra lookup; the
              // worker uses outcomes for counters today, not for joining.
              tripEventId: ''
            };
          });

          return {
            outcomes,
            counters: {
              created: result.eventsCreated,
              skipped: result.eventsSkipped,
              rejected: result.recordsRejected
            }
          };
        }
      }),
      inject: [TripsService]
    }
  ],
  exports: [
    SyncLogRetentionService,
    SyncSchedulerService,
    SyncWorkerService,
    PROVIDER_ADAPTERS,
    TRIP_EVENT_APPLY_PORT
  ]
})
export class IntegrationsModule {}
