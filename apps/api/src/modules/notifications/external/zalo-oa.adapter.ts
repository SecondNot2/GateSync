import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { defaultSensitiveScrubber, type SensitiveScrubber } from '@gatesync/shared';

import type {
  ExternalChannelAdapter,
  ExternalChannelKind,
  ExternalDispatchInput,
  ExternalDispatchResult
} from './external-channel.port';
import { getTemplate, renderTemplate } from './templates';

/**
 * `ZaloOaAdapter`
 *
 * Sends a notification via Zalo Official Account using a Vietnamese-friendly
 * template selected by `eventType`. The actual Zalo OA HTTP call is left as
 * a TODO — this stub implements the contract end-to-end (template lookup,
 * scrubbing, payload digest, audit logging) so the BullMQ
 * `External_Channel_Dispatcher` can wire it in without further changes when
 * the provider client lands.
 *
 * Responsibilities (Requirements 9.1, 9.5, 11.4):
 * - Render the template through {@link defaultSensitiveScrubber.scrubString}
 *   so no sensitive substring (phone, plate, declaration, credential) ever
 *   reaches the Zalo OA endpoint or the local log.
 * - Compute `payloadDigest = sha256(JSON.stringify(deliveredPayload))`. The
 *   digest is the only audit hook into the rendered content per Requirement
 *   11.4 (`Notification_Delivery.payloadDigest`); the dispatcher persists
 *   the value alongside the delivery row.
 * - Read provider credentials from {@link ConfigService} (`ZALO_OA_TOKEN`).
 *   Missing credentials yield a permanent failure so the dispatcher does not
 *   waste retries.
 *
 * Boundaries:
 * - Stateless — no DB or queue access; the dispatcher provides every
 *   required field via `ExternalDispatchInput`.
 * - The actual HTTPS call to `https://openapi.zalo.me/...` is intentionally
 *   stubbed; see TODO below.
 */
@Injectable()
export class ZaloOaAdapter implements ExternalChannelAdapter {
  readonly kind: ExternalChannelKind = 'zalo';
  private readonly logger = new Logger(ZaloOaAdapter.name);
  private readonly scrubber: SensitiveScrubber = defaultSensitiveScrubber;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {}

  async send(input: ExternalDispatchInput): Promise<ExternalDispatchResult> {
    const accessToken = this.configService.get<string>('ZALO_OA_TOKEN');
    if (!accessToken) {
      // Permanent: there is no point retrying without a configured token.
      return {
        status: 'FAILED',
        failureReason: 'ZALO_OA_TOKEN_NOT_CONFIGURED',
        transient: false
      };
    }

    if (!input.recipientContact) {
      return {
        status: 'FAILED',
        failureReason: 'MISSING_CONTACT',
        transient: false
      };
    }

    const template = getTemplate('zalo', input.eventType);
    const context = this.buildContext(input);

    const renderedSubject =
      template.subject !== undefined
        ? this.scrubber.scrubString(renderTemplate(template.subject, context))
        : undefined;
    const renderedBody = this.scrubber.scrubString(renderTemplate(template.bodyText, context));

    const deliveredPayload: Record<string, unknown> = {
      channel: this.kind,
      eventType: input.eventType,
      recipientContact: input.recipientContact,
      tripId: input.tripId ?? null,
      title: renderedSubject ?? null,
      body: renderedBody,
      // Pass through any extra structured Zalo template params provided by the
      // orchestrator (already scrubbed upstream per port contract).
      params: input.payload ?? null
    };
    const payloadDigest = createHash('sha256')
      .update(JSON.stringify(deliveredPayload))
      .digest('hex');

    // TODO(integrations): replace this stub with a real HTTPS call to the
    // Zalo OA `/v3.0/oa/message/transaction` endpoint. Network failures and
    // 408/429/5xx responses MUST surface as `transient = true`; auth/4xx
    // (missing template, invalid recipient) MUST surface as `transient =
    // false` so the BullMQ retry policy in task 11.3 can act correctly.
    this.logger.log(
      `Zalo OA stub send (deliveryId=${input.deliveryId}, eventType=${input.eventType}, payloadDigest=${payloadDigest})`
    );

    const providerMessageId = `zalo-stub-${input.deliveryId}`;
    return { status: 'SENT', providerMessageId };
  }

  private buildContext(input: ExternalDispatchInput): Record<string, string> {
    return {
      title: input.title,
      body: input.body,
      tripId: input.tripId ?? '',
      eventType: input.eventType,
      // The dispatcher passes the canonical `occurredAt` in `payload` when
      // available; fall back to "now" so the template never leaves a raw
      // placeholder visible to recipients.
      occurredAt:
        typeof input.payload?.occurredAt === 'string'
          ? input.payload.occurredAt
          : new Date().toISOString()
    };
  }
}
