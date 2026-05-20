import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PublishResult, RealtimeChannelPort, RealtimeMessage } from './realtime-channel.port';

const DEFAULT_PUBLISH_TIMEOUT_MS = 5_000;
const TRANSIENT_HTTP_STATUSES = new Set<number>([408, 429]);

/**
 * SupabaseRealtimeAdapter
 *
 * Publishes a `RealtimeMessage` to the per-user topic
 * `org:{organizationId}:user:{userId}` via the Supabase Realtime broadcast
 * HTTP endpoint (`POST /realtime/v1/api/broadcast`).
 *
 * Why HTTP broadcast and not `@supabase/supabase-js`:
 * - The codebase already calls Supabase HTTP endpoints with the global
 *   `fetch` (see `cua-khau-so.client.ts`, `supabase-jwt.guard.ts`).
 * - The broadcast endpoint is stateless; we have no need for a long-lived
 *   websocket on the server. Avoiding `@supabase/supabase-js` keeps the
 *   API bundle slim and removes a transitive WS dependency.
 *
 * Responsibilities (Requirements 8.1, 8.2, 8.5, 8.7):
 * - Build the topic exactly as `org:{organizationId}:user:{userId}` so the
 *   subscriber-side JWT/topic check at task 10.2 can validate it.
 * - Send only the minimal payload defined by `RealtimeMessage`. Sensitive
 *   fields are the orchestrator's responsibility to scrub upstream.
 * - Distinguish transient failures (network error, abort/timeout, 408, 429,
 *   5xx) from permanent ones (missing config, other 4xx) via
 *   `PublishResult.transient`. The dispatcher applies the
 *   `REALTIME_RETRY_POLICY` (1s, 3s, max 2 retries) only when `transient`
 *   is true.
 *
 * Boundaries:
 * - This adapter does NOT touch Prisma. Persisting `Notification.deliveredAt`
 *   or `FAILED` status belongs to the dispatcher (task 10.x downstream).
 * - It does NOT enforce JWT topic authorization; that runs at the
 *   subscriber/JWT verification layer (task 10.2).
 */
@Injectable()
export class SupabaseRealtimeAdapter implements RealtimeChannelPort {
  private readonly logger = new Logger(SupabaseRealtimeAdapter.name);
  private readonly publishTimeoutMs: number;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {
    const configured = this.configService.get<number>('REALTIME_PUBLISH_TIMEOUT_MS');
    this.publishTimeoutMs =
      typeof configured === 'number' && Number.isFinite(configured) && configured > 0
        ? configured
        : DEFAULT_PUBLISH_TIMEOUT_MS;
  }

  async publishToUser(
    organizationId: string,
    userId: string,
    message: RealtimeMessage
  ): Promise<PublishResult> {
    if (!organizationId || !userId) {
      return {
        status: 'FAILED',
        reason: 'INVALID_RECIPIENT',
        transient: false
      };
    }

    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      this.logger.error(
        'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured; realtime publish disabled.'
      );
      return {
        status: 'FAILED',
        reason: 'REALTIME_NOT_CONFIGURED',
        transient: false
      };
    }

    const topic = `org:${organizationId}:user:${userId}`;
    const endpoint = this.resolveBroadcastEndpoint(supabaseUrl);
    const body = JSON.stringify({
      messages: [
        {
          topic,
          event: message.eventType,
          payload: this.toBroadcastPayload(message),
          private: true
        }
      ]
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.publishTimeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json'
        },
        body,
        signal: controller.signal
      });

      if (response.ok) {
        return { status: 'SENT' };
      }

      const reason = `REALTIME_HTTP_${response.status}`;
      const transient = response.status >= 500 || TRANSIENT_HTTP_STATUSES.has(response.status);

      // Drain the body so the connection can be reused; ignore parse errors —
      // we never log raw bodies because they may echo sensitive content.
      try {
        await response.text();
      } catch {
        // ignore
      }

      this.logger.warn(
        `Supabase realtime broadcast failed (status=${response.status}, transient=${transient}).`
      );

      return { status: 'FAILED', reason, transient };
    } catch (error) {
      const reason = this.classifyError(error);
      // Network errors, DNS failures, and aborts are all transient.
      return { status: 'FAILED', reason, transient: true };
    } finally {
      clearTimeout(timeout);
    }
  }

  private resolveBroadcastEndpoint(supabaseUrl: string): string {
    const trimmed = supabaseUrl.replace(/\/+$/u, '');
    return `${trimmed}/realtime/v1/api/broadcast`;
  }

  private toBroadcastPayload(message: RealtimeMessage): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      deliveryId: message.deliveryId,
      eventType: message.eventType,
      occurredAt: message.occurredAt,
      title: message.title,
      body: message.body
    };

    if (typeof message.tripId === 'string' && message.tripId.length > 0) {
      payload.tripId = message.tripId;
    }

    return payload;
  }

  private classifyError(error: unknown): string {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return 'REALTIME_TIMEOUT';
      }
      return `REALTIME_NETWORK_ERROR:${error.name}`;
    }
    return 'REALTIME_NETWORK_ERROR';
  }
}

// Re-export so module wiring can do
//   { provide: REALTIME_CHANNEL_PORT, useClass: SupabaseRealtimeAdapter }
// without importing from two files.
export { REALTIME_CHANNEL_PORT, REALTIME_RETRY_POLICY } from './realtime-channel.port';
export type { PublishResult, RealtimeChannelPort, RealtimeMessage } from './realtime-channel.port';
