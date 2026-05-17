import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from '../audit';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationRetentionService } from './notification-retention.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsLifecycleController } from './notifications-lifecycle.controller';
import { NotificationsLifecycleService } from './notifications-lifecycle.service';
import { NotificationsService } from './notifications.service';
import { EmailAdapter } from './external/email.adapter';
import {
  EXTERNAL_CHANNEL_ADAPTERS,
  InMemoryExternalChannelRegistry,
  type ExternalChannelRegistry
} from './external/external-channel.port';
import { ExternalChannelDispatcher } from './external/external-channel-dispatcher.service';
import { SmsAdapter } from './external/sms.adapter';
import { ZaloOaAdapter } from './external/zalo-oa.adapter';
import { NotificationOrchestrator } from './orchestrator/notification-orchestrator.service';
import { PreferenceFilter } from './orchestrator/preference-filter';
import { RecipientResolver } from './orchestrator/recipient-resolver';
import { NotificationPreferencesController } from './preferences/notification-preferences.controller';
import { NotificationPreferencesService } from './preferences/notification-preferences.service';
import { REALTIME_CHANNEL_PORT } from './realtime/realtime-channel.port';
import { RealtimeController } from './realtime/realtime.controller';
import { RealtimeTopicAuthorizer } from './realtime/realtime-topic-authorizer';
import { SupabaseRealtimeAdapter } from './realtime/supabase-realtime.adapter';
import { NotificationRulesController } from './rules/notification-rules.controller';
import { NotificationRulesService } from './rules/notification-rules.service';

/**
 * NotificationsModule
 *
 * Wires the notification subsystem: rules, preferences, realtime channel,
 * the orchestrator that subscribes to `TRIP_DOMAIN_EVENT`, and the BullMQ
 * dispatcher that drains external `Notification` rows for Zalo OA / SMS /
 * Email. We rely on the global `EventEmitterModule.forRoot()` registered
 * by `TripsModule` to provide `EventEmitter2`; importing `forRoot()` here
 * as well would register duplicate providers on the global scope.
 *
 * The three concrete external adapters (`ZaloOaAdapter`, `SmsAdapter`,
 * `EmailAdapter`) are instantiated as Nest providers and pushed into a
 * shared `ExternalChannelRegistry` exposed under
 * {@link EXTERNAL_CHANNEL_ADAPTERS}; the dispatcher resolves them via DI
 * rather than a switch statement so future channels can be added without
 * touching dispatcher code.
 */
@Module({
  imports: [ConfigModule, PrismaModule, AuthModule, AuditModule],
  controllers: [
    NotificationsController,
    NotificationsLifecycleController,
    NotificationPreferencesController,
    NotificationRulesController,
    RealtimeController
  ],
  providers: [
    NotificationsService,
    NotificationsLifecycleService,
    NotificationPreferencesService,
    NotificationRetentionService,
    NotificationRulesService,
    RealtimeTopicAuthorizer,
    SupabaseRealtimeAdapter,
    RecipientResolver,
    PreferenceFilter,
    NotificationOrchestrator,
    ZaloOaAdapter,
    SmsAdapter,
    EmailAdapter,
    ExternalChannelDispatcher,
    {
      provide: REALTIME_CHANNEL_PORT,
      useExisting: SupabaseRealtimeAdapter
    },
    {
      provide: EXTERNAL_CHANNEL_ADAPTERS,
      useFactory: (
        zalo: ZaloOaAdapter,
        sms: SmsAdapter,
        email: EmailAdapter
      ): ExternalChannelRegistry =>
        new InMemoryExternalChannelRegistry([
          ['zalo', zalo],
          ['sms', sms],
          ['email', email]
        ]),
      inject: [ZaloOaAdapter, SmsAdapter, EmailAdapter]
    }
  ],
  exports: [
    NotificationsService,
    NotificationsLifecycleService,
    NotificationPreferencesService,
    NotificationRetentionService,
    NotificationRulesService,
    RealtimeTopicAuthorizer,
    RecipientResolver,
    PreferenceFilter,
    NotificationOrchestrator,
    ExternalChannelDispatcher,
    REALTIME_CHANNEL_PORT,
    EXTERNAL_CHANNEL_ADAPTERS
  ]
})
export class NotificationsModule {}
