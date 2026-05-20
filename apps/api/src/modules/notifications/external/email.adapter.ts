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

interface EmailSmtpConfig {
  readonly host: string;
  readonly port: number;
  readonly user?: string;
  readonly fromAddress?: string;
}

/**
 * `EmailAdapter`
 *
 * Sends a notification via SMTP using a Vietnamese-friendly template
 * selected by `eventType`. The actual SMTP send is left as a TODO — this
 * stub fully implements the contract (template lookup, scrubbing, payload
 * digest, transient-vs-permanent classification) so the BullMQ dispatcher
 * in task 11.3 can rely on it without further changes when the SMTP client
 * (e.g. nodemailer) lands.
 *
 * Responsibilities (Requirements 9.1, 9.5, 11.4):
 * - Render subject + body through {@link defaultSensitiveScrubber.scrubString}
 *   so no sensitive substring leaks into the SMTP payload or local logs.
 * - Compute `payloadDigest = sha256(JSON.stringify(deliveredPayload))` for
 *   audit cross-reference (`Notification_Delivery.payloadDigest`).
 * - Read provider credentials from {@link ConfigService} (`EMAIL_SMTP_HOST`,
 *   `EMAIL_SMTP_PORT`, `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASSWORD`,
 *   `EMAIL_SMTP_FROM`). Missing host yields a permanent failure so the
 *   dispatcher does not waste retries on a misconfigured environment.
 *
 * Boundaries:
 * - Stateless — no DB / queue access. The dispatcher supplies every field.
 * - The SMTP password is read but never logged, never echoed in
 *   `failureReason`, and never included in `deliveredPayload`.
 */
@Injectable()
export class EmailAdapter implements ExternalChannelAdapter {
  readonly kind: ExternalChannelKind = 'email';
  private readonly logger = new Logger(EmailAdapter.name);
  private readonly scrubber: SensitiveScrubber = defaultSensitiveScrubber;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {}

  async send(input: ExternalDispatchInput): Promise<ExternalDispatchResult> {
    const smtp = this.resolveSmtpConfig();
    if (!smtp) {
      return {
        status: 'FAILED',
        failureReason: 'EMAIL_SMTP_NOT_CONFIGURED',
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

    const template = getTemplate('email', input.eventType);
    const context = this.buildContext(input);

    const renderedSubject = this.scrubber.scrubString(
      renderTemplate(template.subject ?? '[GateSync] {title}', context)
    );
    const renderedBody = this.scrubber.scrubString(renderTemplate(template.bodyText, context));

    const deliveredPayload: Record<string, unknown> = {
      channel: this.kind,
      eventType: input.eventType,
      recipientContact: input.recipientContact,
      tripId: input.tripId ?? null,
      from: smtp.fromAddress ?? smtp.user ?? null,
      subject: renderedSubject,
      body: renderedBody
      // NOTE: SMTP password is intentionally excluded from the digested
      // payload so a future audit dump can never expose it.
    };
    const payloadDigest = createHash('sha256')
      .update(JSON.stringify(deliveredPayload))
      .digest('hex');

    // TODO(integrations): replace this stub with a real SMTP send (likely
    // `nodemailer.createTransport({ host, port, auth: { user, pass } })`).
    // Network failures, timeouts, 4xx temporary SMTP responses (e.g. 421,
    // 450, 451, 452) MUST surface as `transient = true`; permanent SMTP
    // 5xx responses (e.g. 550 invalid recipient, 553 invalid from address)
    // MUST surface as `transient = false` so the BullMQ retry policy (max
    // 3 in task 11.3) does not waste budget on permanent failures.
    this.logger.log(
      `Email stub send (deliveryId=${input.deliveryId}, eventType=${input.eventType}, payloadDigest=${payloadDigest})`
    );

    const providerMessageId = `email-stub-${input.deliveryId}`;
    return { status: 'SENT', providerMessageId };
  }

  private resolveSmtpConfig(): EmailSmtpConfig | undefined {
    const host = this.configService.get<string>('EMAIL_SMTP_HOST');
    if (!host) {
      return undefined;
    }
    const portRaw = this.configService.get<string | number>('EMAIL_SMTP_PORT');
    const port =
      typeof portRaw === 'number'
        ? portRaw
        : typeof portRaw === 'string' && portRaw.length > 0
          ? Number.parseInt(portRaw, 10)
          : 587;

    const user = this.configService.get<string>('EMAIL_SMTP_USER');
    const fromAddress = this.configService.get<string>('EMAIL_SMTP_FROM');
    const config: EmailSmtpConfig = {
      host,
      port: Number.isFinite(port) && port > 0 ? port : 587,
      ...(user ? { user } : {}),
      ...(fromAddress ? { fromAddress } : {})
    };
    return config;
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
