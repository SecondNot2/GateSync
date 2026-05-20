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
 * `SmsAdapter`
 *
 * Sends a notification via the configured SMS provider (Vietnamese
 * operators are expected to be wired through one HTTP gateway behind
 * `SMS_PROVIDER_API_KEY`). The provider HTTP call is intentionally a stub —
 * see TODO below — but the contract end-to-end (template lookup, scrubbing,
 * payload digest, transient-vs-permanent failure classification) is fully
 * implemented so the BullMQ dispatcher in task 11.3 can rely on it.
 *
 * Responsibilities (Requirements 9.1, 9.5, 11.4):
 * - Render the SMS template through {@link defaultSensitiveScrubber.scrubString}
 *   so no sensitive substring is ever transmitted to the SMS gateway or
 *   logged.
 * - Compute `payloadDigest = sha256(JSON.stringify(deliveredPayload))` for
 *   audit cross-reference (`Notification_Delivery.payloadDigest`).
 * - Read provider credentials from {@link ConfigService} (`SMS_PROVIDER_API_KEY`).
 *   Missing credentials yield a permanent failure so the dispatcher does
 *   not waste retries on a misconfigured environment.
 *
 * Boundaries:
 * - Stateless — no DB / queue access. The dispatcher supplies every field
 *   via `ExternalDispatchInput`.
 * - SMS templates have no subject — only `bodyText`.
 */
@Injectable()
export class SmsAdapter implements ExternalChannelAdapter {
  readonly kind: ExternalChannelKind = 'sms';
  private readonly logger = new Logger(SmsAdapter.name);
  private readonly scrubber: SensitiveScrubber = defaultSensitiveScrubber;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {}

  async send(input: ExternalDispatchInput): Promise<ExternalDispatchResult> {
    const apiKey = this.configService.get<string>('SMS_PROVIDER_API_KEY');
    if (!apiKey) {
      return {
        status: 'FAILED',
        failureReason: 'SMS_PROVIDER_API_KEY_NOT_CONFIGURED',
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

    const template = getTemplate('sms', input.eventType);
    const context = this.buildContext(input);
    const renderedBody = this.scrubber.scrubString(renderTemplate(template.bodyText, context));

    const deliveredPayload: Record<string, unknown> = {
      channel: this.kind,
      eventType: input.eventType,
      recipientContact: input.recipientContact,
      tripId: input.tripId ?? null,
      body: renderedBody
    };
    const payloadDigest = createHash('sha256')
      .update(JSON.stringify(deliveredPayload))
      .digest('hex');

    // TODO(integrations): replace this stub with a real HTTPS POST to the
    // SMS provider API. Network failures, timeouts, 408/429/5xx MUST surface
    // as `transient = true`; auth/4xx errors and "invalid recipient" MUST
    // surface as `transient = false` so the BullMQ retry policy (max 3 in
    // task 11.3) does not waste budget on permanent failures.
    this.logger.log(
      `SMS stub send (deliveryId=${input.deliveryId}, eventType=${input.eventType}, payloadDigest=${payloadDigest})`
    );

    const providerMessageId = `sms-stub-${input.deliveryId}`;
    return { status: 'SENT', providerMessageId };
  }

  private buildContext(input: ExternalDispatchInput): Record<string, string> {
    return {
      title: input.title,
      body: input.body,
      tripId: input.tripId ?? '',
      eventType: input.eventType,
      occurredAt:
        typeof input.payload?.occurredAt === 'string'
          ? input.payload.occurredAt
          : new Date().toISOString()
    };
  }
}
