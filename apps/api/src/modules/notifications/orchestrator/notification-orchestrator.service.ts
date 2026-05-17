import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import type { NotificationChannel } from '@prisma/client';
import { mapTripEventToNotificationEventType, type NotificationEventType } from '@gatesync/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SYNC_RUN_FAILED_EVENT,
  type SyncRunFailedEvent
} from '../../integrations/sync-run-failed.event';
import { TRIP_DOMAIN_EVENT, type TripDomainEvent } from '../../trips/trip-domain-event';
import {
  REALTIME_CHANNEL_PORT,
  REALTIME_RETRY_POLICY,
  type PublishResult,
  type RealtimeChannelPort,
  type RealtimeMessage
} from '../realtime/realtime-channel.port';
import { PreferenceFilter } from './preference-filter';
import { RecipientResolver } from './recipient-resolver';
import { ExternalChannelDispatcher } from '../external/external-channel-dispatcher.service';

/**
 * Channels that require an external contact (phone / email) to be delivered.
 * For these channels the orchestrator must verify the recipient has the
 * corresponding contact before persisting a `PENDING` row; otherwise the
 * row is persisted with `status = FAILED, failureReason = 'MISSING_CONTACT'`
 * so the gap is auditable per Requirement 9.3.
 */
const CONTACT_DEPENDENT_CHANNELS: ReadonlySet<NotificationChannel> = new Set([
  'ZALO_OA',
  'SMS',
  'EMAIL'
]);

/**
 * Vietnamese titles + body templates for the notification eventType allowlist.
 * Mirrors the design's UI copy so realtime payloads carry pre-rendered,
 * sensitive-field-free strings (Property 8 / Requirement 8.6 — no raw payload
 * crosses the realtime boundary).
 */
const NOTIFICATION_TITLES: Readonly<Record<NotificationEventType, string>> = {
  trip_status_changed: 'Trạng thái chuyến đổi',
  vehicle_arrived_gate: 'Đã đến cửa khẩu',
  vehicle_left_gate: 'Đã rời cửa khẩu',
  declaration_rejected: 'Tờ khai bị từ chối',
  fee_pending: 'Có phí chờ thanh toán',
  delay_threshold_exceeded: 'Trễ ngưỡng cho phép',
  // `sync_run_failed` is synthesised by the integrations module's admin
  // alert path, not by `mapTripEventToNotificationEventType`. Including a
  // Vietnamese title here keeps the type exhaustive against
  // `NotificationEventType`; the orchestrator never selects this branch
  // from `TripDomainEvent` so the value is informational.
  sync_run_failed: 'Đồng bộ tích hợp thất bại'
};

/**
 * Internal record of a single `(recipientUserId, channel)` candidate after
 * rule resolution. The orchestrator de-duplicates these on
 * `${recipientUserId}:${channel}` (Requirements 5.6, 7.8) before applying
 * preferences and persisting `Notification` rows.
 *
 * `ruleId` is preserved for `Notification.notificationRuleId`.
 * `mandatory` is the OR of every contributing rule's `mandatory` flag — a
 * single mandatory rule is enough to bypass preferences for that channel,
 * which is the safe direction (Requirement 10.3).
 */
interface RecipientChannelCandidate {
  userId: string;
  channel: NotificationChannel;
  ruleId: string;
  mandatory: boolean;
}

/**
 * Aggregated contact lookup result for a single recipient. The orchestrator
 * loads `User.email`, `User.phone`, and (where the user is a trip's
 * `assigned_driver`) `DriverProfile.phone`. Channels are mapped onto these
 * values to determine `MISSING_CONTACT` per Requirement 9.3.
 */
interface RecipientContacts {
  email: string | null;
  phone: string | null;
}

/**
 * NotificationOrchestrator
 *
 * Subscribes to `TRIP_DOMAIN_EVENT` and converts a committed `TripEvent`
 * into `Notification` rows + dispatch jobs. The pipeline implements the
 * design's correctness properties end-to-end:
 *
 *  1. **Filter eventType** — Map `TripEvent.eventType` (+ derived flags) to
 *     a notification eventType in the allowlist. Skip & emit
 *     `notification_event_skipped` metric otherwise (Property 12 / Req 5.2,
 *     5.3).
 *  2. **Skip corrections** — `event.isCorrection === true` short-circuits
 *     to zero deliveries (Property 13 / Req 5.4).
 *  3. **Resolve rules** — `enabled = true ∧ deletedAt IS NULL` and matching
 *     `(organizationId, eventType)` (Property 15 / Req 7.1).
 *  4. **Resolve recipients** — delegated to {@link RecipientResolver}.
 *     RBAC trip-access filtering is a TODO in this iteration; the resolver
 *     restricts recipients to org admins, operators, drivers, and trip
 *     participants, which already satisfies the spirit of Req 7.6 for the
 *     scopes we ship today. A future task will add an explicit per-trip
 *     ACL once partner-trip RBAC is finalised.
 *  5. **De-duplicate** — `(eventId, recipientUserId, channel)` is unique at
 *     the DB level; we additionally de-dup in memory across rules so we
 *     don't burn round-trips on rows that would conflict (Property 14 / Req
 *     5.6, 7.8).
 *  6. **Apply preferences** — {@link PreferenceFilter} drops opted-out
 *     channels unless the rule is `mandatory` (Req 10.2, 10.3).
 *  7. **Validate contact** — for `ZALO_OA`/`SMS`/`EMAIL`, load
 *     `User.email` / `User.phone`; missing contacts persist a `FAILED` row
 *     with `failureReason = 'MISSING_CONTACT'` (Req 9.3).
 *  8. **Insert + dispatch** — insert per `(eventId, recipientUserId,
 *     channel)`; on P2002 fall through silently (idempotency, Req 5.6).
 *     For `IN_APP` we publish via `RealtimeChannelPort` with the design's
 *     retry policy (1s, 3s, max 2 retries) and update `status` accordingly.
 *     External channels are persisted as `PENDING` for the dispatcher in
 *     task 11.3 to consume.
 *
 * Failures are isolated per-recipient — one bad row never aborts the whole
 * fan-out. Metric placeholders are emitted via the Nest logger; a real
 * metrics backend is wired in a later task.
 */
@Injectable()
export class NotificationOrchestrator {
  private readonly logger = new Logger(NotificationOrchestrator.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RecipientResolver) private readonly recipientResolver: RecipientResolver,
    @Inject(PreferenceFilter) private readonly preferenceFilter: PreferenceFilter,
    @Optional()
    @Inject(REALTIME_CHANNEL_PORT)
    private readonly realtimeChannel: RealtimeChannelPort | null = null,
    @Optional()
    @Inject(ExternalChannelDispatcher)
    private readonly externalDispatcher: ExternalChannelDispatcher | null = null
  ) {}

  @OnEvent(TRIP_DOMAIN_EVENT)
  async handleTripDomainEvent(event: TripDomainEvent): Promise<void> {
    try {
      await this.process(event);
    } catch (error) {
      // Never throw out of an event handler — `EventEmitter2` would
      // surface this back through the publisher's stack and we don't want
      // a notification fan-out failure to roll back the trip transaction
      // (the row is already committed at this point).
      this.logger.error(
        `Failed to process TripDomainEvent eventId=${event.eventId} tripId=${event.tripId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Subscribes to `SYNC_RUN_FAILED_EVENT` and fans out the implicit,
   * mandatory `sync_run_failed` notification to every organization admin
   * (`OWNER` + `ADMIN`) of the integration account's organization
   * (Requirements 3.4, 3.5).
   *
   * The handler bypasses `NotificationRule` lookup entirely — the rule is
   * synthesised in-memory with `recipientScope = organization_admins`,
   * `mandatory = true`, and `channels = [IN_APP, EMAIL]`. Reusing the
   * existing recipient resolver, contact loader, and per-channel dispatch
   * helpers keeps scrubbing, idempotency, and audit semantics consistent
   * with rule-driven notifications.
   */
  @OnEvent(SYNC_RUN_FAILED_EVENT)
  async handleSyncRunFailedEvent(event: SyncRunFailedEvent): Promise<void> {
    try {
      await this.processSyncRunFailed(event);
    } catch (error) {
      // Same defence-in-depth as the trip event handler: never propagate.
      this.logger.error(
        `Failed to process SyncRunFailedEvent syncRunId=${event.syncRunId} integrationAccountId=${event.integrationAccountId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Pipeline entry point — extracted so tests can drive the orchestrator
   * synchronously without going through the event bus.
   */
  async process(event: TripDomainEvent): Promise<void> {
    // Step 2: skip corrections (Property 13 / Req 5.4).
    if (event.isCorrection === true) {
      return;
    }

    // Step 1: map to a notification eventType. We don't yet carry a
    // `tripStatusChanged` flag on `TripDomainEvent`; the direct mapping
    // table covers all eventTypes we currently emit notifications for, and
    // the fallback to `trip_status_changed` is opt-in once the trip event
    // service starts forwarding the flag. Passing `{}` keeps the call
    // forward-compatible.
    const notificationEventType = mapTripEventToNotificationEventType(event.eventType, {});
    if (notificationEventType === null) {
      // Metric placeholder — Property 12 / Req 5.3.
      this.logger.debug(
        `notification_event_skipped eventType=${event.eventType} eventId=${event.eventId}`
      );
      return;
    }

    // Step 3: resolve matching rules (Property 15 / Req 7.1).
    const rules = await this.prisma.notificationRule.findMany({
      where: {
        organizationId: event.organizationId,
        eventType: notificationEventType,
        enabled: true,
        deletedAt: null
      }
    });

    if (rules.length === 0) {
      return;
    }

    // Steps 4 + 5: resolve recipients per rule and de-duplicate by
    // `(userId, channel)`. The DB unique constraint on
    // `(eventId, recipientUserId, channel)` is the source of truth, but
    // de-duping here avoids wasted round-trips and lets us aggregate the
    // `mandatory` flag per channel before invoking the preference filter.
    const candidatesByKey = new Map<string, RecipientChannelCandidate>();
    for (const rule of rules) {
      const recipients = await this.recipientResolver.resolveRecipients(rule, event);
      // TODO(rbac-trip-access): once the partner-trip RBAC scheme is
      // finalised, add an explicit "can this user view event.tripId?"
      // check here. The current resolver scopes to org admins, operators,
      // drivers, and trip participants, which already satisfies the
      // spirit of Requirement 7.6 for the scopes we ship today.
      for (const recipient of recipients) {
        for (const channel of rule.channels) {
          const key = `${recipient.userId}:${channel}`;
          const existing = candidatesByKey.get(key);
          if (!existing) {
            candidatesByKey.set(key, {
              userId: recipient.userId,
              channel,
              ruleId: rule.id,
              mandatory: rule.mandatory
            });
          } else if (rule.mandatory && !existing.mandatory) {
            // Promote to mandatory: if any contributing rule is
            // mandatory, the channel must bypass preferences (Req 10.3).
            // The resolved `ruleId` keeps pointing at the first rule for
            // audit traceability — switching to the mandatory rule's id
            // would lose information about the optional rule that also
            // matched. Preserving the first id is consistent with how
            // other audit trails in this codebase resolve ties.
            existing.mandatory = true;
          }
        }
      }
    }

    if (candidatesByKey.size === 0) {
      return;
    }

    // Step 6: apply preference filter per recipient. We group candidates
    // by user so we can compose the channel set the user opted into in a
    // single pass; mandatory channels short-circuit the filter.
    const byUser = new Map<string, RecipientChannelCandidate[]>();
    for (const candidate of candidatesByKey.values()) {
      const list = byUser.get(candidate.userId);
      if (list) {
        list.push(candidate);
      } else {
        byUser.set(candidate.userId, [candidate]);
      }
    }

    const allowedCandidates: RecipientChannelCandidate[] = [];
    for (const [userId, candidates] of byUser) {
      const mandatoryChannels = candidates
        .filter((candidate) => candidate.mandatory)
        .map((candidate) => candidate.channel);
      const optionalChannels = candidates
        .filter((candidate) => !candidate.mandatory)
        .map((candidate) => candidate.channel);

      // Mandatory channels skip the filter entirely — the filter would
      // already short-circuit when called with `mandatory = true`, but
      // splitting avoids one DB query when every channel is mandatory.
      const allowedChannelSet = new Set<NotificationChannel>(mandatoryChannels);

      if (optionalChannels.length > 0) {
        const filtered = await this.preferenceFilter.filterChannelsForRecipient({
          userId,
          organizationId: event.organizationId,
          eventType: notificationEventType,
          channels: optionalChannels,
          mandatory: false
        });
        for (const channel of filtered) {
          allowedChannelSet.add(channel);
        }
      }

      for (const candidate of candidates) {
        if (allowedChannelSet.has(candidate.channel)) {
          allowedCandidates.push(candidate);
        }
      }
    }

    if (allowedCandidates.length === 0) {
      return;
    }

    // Step 7: contact validity per recipient. Only loaded once per user
    // even when multiple channels are involved.
    const contactsByUser = await this.loadContacts(
      [...new Set(allowedCandidates.map((c) => c.userId))],
      event
    );

    // Steps 8 + 9: persist + dispatch per `(userId, channel)`. We process
    // sequentially so a single failure can't fan out and so logs stay
    // ordered; the volume per event is small (admins + operators + driver).
    const title = NOTIFICATION_TITLES[notificationEventType];
    const occurredAtIso = event.occurredAt.toISOString();
    const body = this.buildBody(notificationEventType, event);

    for (const candidate of allowedCandidates) {
      try {
        await this.dispatchOne({
          event,
          notificationEventType,
          candidate,
          contacts: contactsByUser.get(candidate.userId) ?? { email: null, phone: null },
          title,
          body,
          occurredAtIso
        });
      } catch (error) {
        // Per-recipient isolation: log and continue. The handler-level
        // try/catch protects the rest of the bus from unhandled rejections.
        this.logger.error(
          `Failed to dispatch notification eventId=${event.eventId} userId=${candidate.userId} channel=${candidate.channel}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  /**
   * Persist a `Notification` row and (for `IN_APP`) attempt realtime
   * publication. Captures P2002 unique-constraint violations as silent
   * idempotency skips so a replayed event never produces duplicate rows
   * (Property 14 / Req 5.6, 7.8).
   */
  private async dispatchOne(args: {
    event: TripDomainEvent;
    notificationEventType: NotificationEventType;
    candidate: RecipientChannelCandidate;
    contacts: RecipientContacts;
    title: string;
    body: string;
    occurredAtIso: string;
  }): Promise<void> {
    const { event, notificationEventType, candidate, contacts, title, body, occurredAtIso } = args;

    // External-channel contact validity (Req 9.3). We persist a `FAILED`
    // row with `failureReason = 'MISSING_CONTACT'` rather than skipping
    // silently so admins can audit gaps via the notifications list.
    if (CONTACT_DEPENDENT_CHANNELS.has(candidate.channel)) {
      const hasContact = this.hasContactForChannel(candidate.channel, contacts);
      if (!hasContact) {
        await this.insertNotificationRow({
          event,
          notificationEventType,
          candidate,
          status: 'FAILED',
          failureReason: 'MISSING_CONTACT',
          title,
          body
        });
        this.logger.warn(
          `notification_missing_contact channel=${candidate.channel} userId=${candidate.userId} eventId=${event.eventId}`
        );
        return;
      }
    }

    if (candidate.channel === 'IN_APP') {
      await this.dispatchInApp({
        event,
        notificationEventType,
        candidate,
        title,
        body,
        occurredAtIso
      });
      return;
    }

    // External channels (`ZALO_OA`, `SMS`, `EMAIL`) and any other
    // non-realtime channels are persisted as `PENDING`. The
    // `ExternalChannelDispatcher` BullMQ worker (task 11.3) drains them
    // by `(channel, status='PENDING')`; we additionally enqueue a job
    // here so a freshly-committed row is dispatched without waiting for
    // a startup recovery scan. The dispatcher re-loads the row before
    // sending and rechecks status, so this hook is idempotent — a
    // duplicate enqueue (replay, idempotent insert race) is safe.
    const persisted = await this.insertNotificationRow({
      event,
      notificationEventType,
      candidate,
      status: 'PENDING',
      title,
      body
    });

    if (persisted !== null && this.externalDispatcher !== null) {
      await this.externalDispatcher.enqueue(persisted.id, candidate.channel);
    }
  }

  /**
   * IN_APP dispatch path. Persists the row first (so the inbox always sees
   * an entry even when the realtime publish fails) and then attempts the
   * broadcast with the design's bounded retry policy.
   *
   * Outcomes (Req 8.3, 8.4, 8.7):
   * - Adapter not wired → status stays `PENDING_IN_APP` (offline fallback).
   * - Publish succeeds → flip to `SENT`, stamp `sentAt`. The schema does
   *   not currently carry a separate `deliveredAt` column; `sentAt` is the
   *   nearest equivalent and is what the inbox UI treats as the moment
   *   the message left the server.
   * - Permanent failure → flip to `FAILED` with `failureReason`.
   * - Transient failure exhausted → flip to `FAILED` with
   *   `failureReason = 'REALTIME_DISPATCH_FAILED'`.
   */
  private async dispatchInApp(args: {
    event: TripDomainEvent;
    notificationEventType: NotificationEventType;
    candidate: RecipientChannelCandidate;
    title: string;
    body: string;
    occurredAtIso: string;
  }): Promise<void> {
    const { event, notificationEventType, candidate, title, body, occurredAtIso } = args;

    const persisted = await this.insertNotificationRow({
      event,
      notificationEventType,
      candidate,
      status: 'PENDING_IN_APP',
      title,
      body
    });

    if (persisted === null) {
      // P2002 — another publisher already inserted this row. Idempotency
      // is preserved at the DB layer, so we MUST NOT publish again from
      // this code path; the original publisher owns the dispatch.
      return;
    }

    if (this.realtimeChannel === null) {
      // Offline fallback per Req 8.4 — leave status as `PENDING_IN_APP`
      // so the inbox shows it on next login.
      this.logger.debug(
        `realtime_channel_unwired notificationId=${persisted.id} userId=${candidate.userId}`
      );
      return;
    }

    const message: RealtimeMessage = {
      deliveryId: persisted.id,
      ...(event.tripId ? { tripId: event.tripId } : {}),
      eventType: notificationEventType,
      occurredAt: occurredAtIso,
      title,
      body
    };

    const result = await this.publishWithRetry(event.organizationId, candidate.userId, message);

    if (result.status === 'SENT') {
      await this.prisma.notification.update({
        where: { id: persisted.id },
        data: {
          status: 'SENT',
          sentAt: new Date()
        }
      });
      return;
    }

    // Failure path — stamp `FAILED` with a sanitized reason. Transient
    // exhaustion uses the design's canonical reason code so admins can
    // distinguish infrastructure failures from configuration errors.
    const failureReason = result.transient ? 'REALTIME_DISPATCH_FAILED' : result.reason;
    await this.prisma.notification.update({
      where: { id: persisted.id },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        failureReason
      }
    });
  }

  /**
   * Insert a `Notification` row. Returns the inserted row, or `null` when
   * the unique constraint on `(eventId, recipientUserId, channel)` rejects
   * the insert (idempotency replay).
   */
  private async insertNotificationRow(args: {
    event: TripDomainEvent;
    notificationEventType: NotificationEventType;
    candidate: RecipientChannelCandidate;
    status: 'PENDING' | 'PENDING_IN_APP' | 'FAILED';
    failureReason?: string;
    title: string;
    body: string;
  }): Promise<{ id: string } | null> {
    const { event, notificationEventType, candidate, status, failureReason, title, body } = args;
    try {
      return await this.prisma.notification.create({
        data: {
          organizationId: event.organizationId,
          tripId: event.tripId,
          recipientUserId: candidate.userId,
          notificationRuleId: candidate.ruleId,
          eventId: event.eventId,
          channel: candidate.channel,
          status,
          ...(failureReason ? { failureReason, failedAt: new Date() } : {}),
          payload: {
            kind: 'trip_event',
            eventType: notificationEventType,
            tripEventType: event.eventType,
            title,
            body,
            occurredAt: event.occurredAt.toISOString()
          }
        },
        select: { id: true }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        this.isEventRecipientChannelConflict(error)
      ) {
        // Idempotency replay — another publisher won the race. Silent
        // skip per Req 5.6 / Property 14.
        return null;
      }
      throw error;
    }
  }

  /**
   * Heuristic to confirm a P2002 hit the `(eventId, recipientUserId,
   * channel)` index rather than some unrelated constraint. Prisma surfaces
   * the failing target either as the index name or as the column list; we
   * accept any of those.
   */
  private isEventRecipientChannelConflict(error: Prisma.PrismaClientKnownRequestError): boolean {
    const target = (error.meta as { target?: string | string[] } | undefined)?.target;
    if (typeof target === 'string') {
      return (
        target.includes('eventId') ||
        target.includes('event_id') ||
        target.toLowerCase().includes('notifications_event')
      );
    }
    if (Array.isArray(target)) {
      return target.some((column) => column === 'eventId' || column === 'event_id');
    }
    // No metadata: the unique constraint on `Notification` we care about
    // is the only `(eventId, recipientUserId, channel)` index in the
    // schema, so treating an unknown P2002 as our conflict is safe and
    // preserves idempotency in the worst case.
    return true;
  }

  /**
   * Publish to the realtime channel with the design's bounded retry
   * policy (Req 8.7): 1 initial attempt + up to 2 retries with delays
   * `[1s, 3s]`. Permanent failures short-circuit; transient failures
   * exhaust the policy before we mark the delivery `FAILED`.
   */
  private async publishWithRetry(
    organizationId: string,
    userId: string,
    message: RealtimeMessage
  ): Promise<PublishResult> {
    if (this.realtimeChannel === null) {
      return { status: 'FAILED', reason: 'REALTIME_NOT_CONFIGURED', transient: false };
    }

    let lastResult: PublishResult = {
      status: 'FAILED',
      reason: 'REALTIME_NOT_ATTEMPTED',
      transient: true
    };
    for (let attempt = 0; attempt < REALTIME_RETRY_POLICY.maxAttempts; attempt += 1) {
      const result = await this.realtimeChannel.publishToUser(organizationId, userId, message);
      if (result.status === 'SENT') {
        return result;
      }
      lastResult = result;
      if (!result.transient) {
        return result;
      }
      const nextDelay = REALTIME_RETRY_POLICY.delaysMs[attempt];
      if (nextDelay === undefined) {
        // Out of retries.
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, nextDelay));
    }
    return lastResult;
  }

  /**
   * Loads `User.email` / `User.phone` (and `DriverProfile.phone` as a
   * fallback for driver-only accounts) for the given recipient list.
   * Single round-trip per event keeps per-recipient cost flat.
   */
  private async loadContacts(
    userIds: string[],
    event: TripDomainEvent
  ): Promise<Map<string, RecipientContacts>> {
    const contacts = new Map<string, RecipientContacts>();
    if (userIds.length === 0) {
      return contacts;
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        email: true,
        phone: true,
        driverProfile: {
          where: { organizationId: event.organizationId, deletedAt: null },
          select: { phone: true }
        }
      }
    });

    for (const user of users) {
      const driverPhone = user.driverProfile?.phone ?? null;
      contacts.set(user.id, {
        email: user.email ?? null,
        phone: user.phone ?? driverPhone
      });
    }

    // Fill in any user we couldn't load (deleted, missing) so the contact
    // check downstream produces a deterministic `MISSING_CONTACT` failure
    // row instead of throwing on a Map miss.
    for (const userId of userIds) {
      if (!contacts.has(userId)) {
        contacts.set(userId, { email: null, phone: null });
      }
    }
    return contacts;
  }

  private hasContactForChannel(channel: NotificationChannel, contacts: RecipientContacts): boolean {
    switch (channel) {
      case 'EMAIL':
        return typeof contacts.email === 'string' && contacts.email.length > 0;
      case 'SMS':
      case 'ZALO_OA':
        return typeof contacts.phone === 'string' && contacts.phone.length > 0;
      default:
        return true;
    }
  }

  /**
   * Build a short, sensitive-field-free Vietnamese body for the realtime
   * payload + inbox card. The orchestrator never embeds raw provider
   * payloads or PII; richer detail is fetched by the client via
   * `GET /api/v1/notifications/:id` once RBAC has been re-checked
   * (Req 8.6).
   */
  private buildBody(notificationEventType: NotificationEventType, event: TripDomainEvent): string {
    const occurred = event.occurredAt.toISOString();
    switch (notificationEventType) {
      case 'vehicle_arrived_gate':
        return `Phương tiện đã đến cửa khẩu lúc ${occurred}.`;
      case 'vehicle_left_gate':
        return `Phương tiện đã rời cửa khẩu lúc ${occurred}.`;
      case 'declaration_rejected':
        return `Tờ khai đã bị từ chối lúc ${occurred}.`;
      case 'fee_pending':
        return `Có khoản phí đang chờ thanh toán lúc ${occurred}.`;
      case 'delay_threshold_exceeded':
        return `Chuyến đã vượt ngưỡng trễ cho phép lúc ${occurred}.`;
      case 'trip_status_changed':
      default:
        return `Trạng thái chuyến đã thay đổi lúc ${occurred}.`;
    }
  }

  // ---------------------------------------------------------------------------
  // sync_run_failed pipeline (Requirements 3.4, 3.5 / task 13.1)
  // ---------------------------------------------------------------------------

  /**
   * Mandatory channels for the synthetic `sync_run_failed` rule. Per design
   * §"FAILED on Sync_Run", admins must receive both an in-app realtime
   * notification and an email; preferences cannot suppress this fan-out.
   */
  private static readonly SYNC_RUN_FAILED_CHANNELS: readonly NotificationChannel[] = [
    'IN_APP',
    'EMAIL'
  ];

  /**
   * Pipeline entry point for `SyncRunFailedEvent`. Bypasses
   * `NotificationRule` lookup — the rule is synthesised in-memory with
   * `recipientScope = organization_admins` and `mandatory = true` — and
   * reuses the realtime / external dispatch helpers used by the
   * trip-event pipeline so scrubbing, idempotency, and audit semantics
   * stay consistent.
   *
   * Idempotency is enforced by `Notification`'s
   * `(eventId, recipientUserId, channel)` unique index: we set
   * `eventId = event.syncRunId` so a replayed failure event for the
   * same run never produces duplicate rows.
   */
  async processSyncRunFailed(event: SyncRunFailedEvent): Promise<void> {
    // Resolve org admins (OWNER + ADMIN) directly from `Membership` —
    // this is the same query `RecipientResolver` runs for the
    // `organization_admins` scope, but inlined because we are
    // bypassing rule lookup entirely.
    const memberships = await this.prisma.membership.findMany({
      where: {
        organizationId: event.organizationId,
        role: { in: ['OWNER', 'ADMIN'] },
        status: 'ACTIVE',
        deletedAt: null,
        createdAt: { lte: event.failedAt }
      },
      select: { userId: true }
    });

    if (memberships.length === 0) {
      // No admins to notify (organisation may have just been created or
      // every admin was suspended). The run is already `FAILED` in DB
      // and visible in the admin UI, so this is a benign no-op.
      this.logger.warn(
        `sync_run_failed_no_admins organizationId=${event.organizationId} syncRunId=${event.syncRunId}`
      );
      return;
    }

    const adminUserIds = [...new Set(memberships.map((m) => m.userId))];
    const contactsByUser = await this.loadContactsForOrg(adminUserIds, event.organizationId);

    const title = NOTIFICATION_TITLES.sync_run_failed;
    const body = this.buildSyncRunFailedBody(event);
    const occurredAtIso = event.failedAt.toISOString();

    for (const userId of adminUserIds) {
      for (const channel of NotificationOrchestrator.SYNC_RUN_FAILED_CHANNELS) {
        try {
          await this.dispatchSyncRunFailedOne({
            event,
            userId,
            channel,
            contacts: contactsByUser.get(userId) ?? { email: null, phone: null },
            title,
            body,
            occurredAtIso
          });
        } catch (error) {
          // Per-recipient isolation, mirroring `process()`.
          this.logger.error(
            `Failed to dispatch sync_run_failed notification syncRunId=${event.syncRunId} userId=${userId} channel=${channel}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    }
  }

  /**
   * Persist + dispatch a single `(adminUser, channel)` slot for a
   * `sync_run_failed` event. Mirrors `dispatchOne` for the trip-event
   * pipeline but writes a sync-failure-shaped payload and treats every
   * channel as mandatory (no preference filtering).
   */
  private async dispatchSyncRunFailedOne(args: {
    event: SyncRunFailedEvent;
    userId: string;
    channel: NotificationChannel;
    contacts: RecipientContacts;
    title: string;
    body: string;
    occurredAtIso: string;
  }): Promise<void> {
    const { event, userId, channel, contacts, title, body, occurredAtIso } = args;

    // External-channel contact validity (Req 9.3) — same `MISSING_CONTACT`
    // failure semantics as the trip-event path.
    if (CONTACT_DEPENDENT_CHANNELS.has(channel)) {
      if (!this.hasContactForChannel(channel, contacts)) {
        await this.insertSyncRunFailedRow({
          event,
          userId,
          channel,
          status: 'FAILED',
          failureReason: 'MISSING_CONTACT',
          title,
          body
        });
        this.logger.warn(
          `notification_missing_contact channel=${channel} userId=${userId} syncRunId=${event.syncRunId}`
        );
        return;
      }
    }

    if (channel === 'IN_APP') {
      await this.dispatchSyncRunFailedInApp({
        event,
        userId,
        title,
        body,
        occurredAtIso
      });
      return;
    }

    // External channels: persist `PENDING` and hand off to the
    // dispatcher (when wired). The dispatcher re-loads the row before
    // sending, so a duplicate enqueue is safe.
    const persisted = await this.insertSyncRunFailedRow({
      event,
      userId,
      channel,
      status: 'PENDING',
      title,
      body
    });

    if (persisted !== null && this.externalDispatcher !== null) {
      await this.externalDispatcher.enqueue(persisted.id, channel);
    }
  }

  /**
   * IN_APP path for `sync_run_failed`. Same retry policy and final-status
   * semantics as `dispatchInApp`; duplicated minimally rather than
   * generalising the trip-event helper to keep the diff surface small
   * and to preserve the trip-only realtime payload shape.
   */
  private async dispatchSyncRunFailedInApp(args: {
    event: SyncRunFailedEvent;
    userId: string;
    title: string;
    body: string;
    occurredAtIso: string;
  }): Promise<void> {
    const { event, userId, title, body, occurredAtIso } = args;

    const persisted = await this.insertSyncRunFailedRow({
      event,
      userId,
      channel: 'IN_APP',
      status: 'PENDING_IN_APP',
      title,
      body
    });

    if (persisted === null) {
      return;
    }

    if (this.realtimeChannel === null) {
      this.logger.debug(
        `realtime_channel_unwired notificationId=${persisted.id} userId=${userId} syncRunId=${event.syncRunId}`
      );
      return;
    }

    const message: RealtimeMessage = {
      deliveryId: persisted.id,
      eventType: 'sync_run_failed',
      occurredAt: occurredAtIso,
      title,
      body
    };

    const result = await this.publishWithRetry(event.organizationId, userId, message);

    if (result.status === 'SENT') {
      await this.prisma.notification.update({
        where: { id: persisted.id },
        data: {
          status: 'SENT',
          sentAt: new Date()
        }
      });
      return;
    }

    const failureReason = result.transient ? 'REALTIME_DISPATCH_FAILED' : result.reason;
    await this.prisma.notification.update({
      where: { id: persisted.id },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        failureReason
      }
    });
  }

  /**
   * Insert a `Notification` row for a `sync_run_failed` event. Unlike the
   * trip-event helper, `tripId` is null and `notificationRuleId` is null
   * (the rule is synthetic), but `eventId = syncRunId` so the existing
   * `(eventId, recipientUserId, channel)` unique index enforces
   * idempotency on replays.
   */
  private async insertSyncRunFailedRow(args: {
    event: SyncRunFailedEvent;
    userId: string;
    channel: NotificationChannel;
    status: 'PENDING' | 'PENDING_IN_APP' | 'FAILED';
    failureReason?: string;
    title: string;
    body: string;
  }): Promise<{ id: string } | null> {
    const { event, userId, channel, status, failureReason, title, body } = args;
    try {
      return await this.prisma.notification.create({
        data: {
          organizationId: event.organizationId,
          tripId: null,
          recipientUserId: userId,
          notificationRuleId: null,
          eventId: event.syncRunId,
          channel,
          status,
          ...(failureReason ? { failureReason, failedAt: new Date() } : {}),
          payload: {
            kind: 'sync_run_failed',
            eventType: 'sync_run_failed',
            syncRunId: event.syncRunId,
            integrationAccountId: event.integrationAccountId,
            provider: event.provider,
            errorCode: event.errorCode,
            errorMessage: event.errorMessage,
            title,
            body,
            occurredAt: event.failedAt.toISOString()
          }
        },
        select: { id: true }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        this.isEventRecipientChannelConflict(error)
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Loads `User.email` / `User.phone` for a flat list of user ids tied to
   * an organization. Mirrors `loadContacts` but does not require a
   * `TripDomainEvent` — `sync_run_failed` recipients are admins (not
   * drivers), so the `DriverProfile.phone` fallback is intentionally
   * skipped.
   */
  private async loadContactsForOrg(
    userIds: string[],
    organizationId: string
  ): Promise<Map<string, RecipientContacts>> {
    void organizationId; // organisation scope is enforced by Membership filter
    const contacts = new Map<string, RecipientContacts>();
    if (userIds.length === 0) {
      return contacts;
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, phone: true }
    });

    for (const user of users) {
      contacts.set(user.id, {
        email: user.email ?? null,
        phone: user.phone ?? null
      });
    }
    for (const userId of userIds) {
      if (!contacts.has(userId)) {
        contacts.set(userId, { email: null, phone: null });
      }
    }
    return contacts;
  }

  /**
   * Vietnamese sync-failure body used in both the realtime payload and
   * the inbox card. Keeps the masked `errorCode` and the already-scrubbed
   * `errorMessage` from the event — sensitive scrubbing is the
   * publisher's responsibility (see `SyncWorkerService.markRunFailed`).
   */
  private buildSyncRunFailedBody(event: SyncRunFailedEvent): string {
    const occurred = event.failedAt.toISOString();
    return `Đồng bộ ${event.provider} thất bại lúc ${occurred} (mã lỗi: ${event.errorCode}). Chi tiết: ${event.errorMessage}`;
  }
}
