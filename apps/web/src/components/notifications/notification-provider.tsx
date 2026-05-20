'use client';

/**
 * NotificationProvider (task 15.1, requirements 14.1, 14.2, 14.4).
 *
 * Initialises a Supabase Realtime client with the authenticated user's JWT
 * and subscribes to the per-user broadcast topic
 * `org:{organizationId}:user:{userId}` defined by the backend
 * `RealtimeChannelPort`. The provider exposes a small React Context so any
 * authenticated screen can:
 *
 *   - read the current connection state (`isConnected`),
 *   - consume the most recent broadcast (`lastMessage`),
 *   - register additional handlers (`subscribe`) — used by `useTripRealtime`
 *     in task 15.2 to filter messages by `tripId` and invalidate TanStack
 *     Query caches.
 *
 * The provider deliberately treats the realtime payload as opaque metadata:
 * it stores `deliveryId`, `tripId`, `eventType`, `occurredAt`, `title`, and
 * `body` (the minimal contract emitted by the backend
 * `SupabaseRealtimeAdapter`) and never touches sensitive fields. Renderers
 * load full content via the REST API (`GET /api/v1/notifications/{id}`) so
 * the server can re-check RBAC per Requirement 8.6 / 14.x.
 *
 * JWT expiry handling (Requirement 14.4): the GateSync web app uses a
 * server-side cookie-backed session (`resolveWebApiSession`) that proxies
 * Supabase Auth. When the channel reports `CHANNEL_ERROR` or `TIMED_OUT`
 * (typical signal of an expired token), we clear the session cache, fetch a
 * fresh access token, call `realtime.setAuth`, and re-subscribe. We never
 * deliver event content before the channel reports `SUBSCRIBED` — the
 * server-side authorize hook (`POST /api/v1/realtime/authorize-topic`,
 * task 10.2) gates that.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { clearWebApiSessionCache, resolveWebApiSession } from '@/lib/api/session';
import { webEnv } from '@/lib/env';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';

/**
 * Minimal payload broadcast to the recipient's per-user topic. Mirrors the
 * backend `RealtimeMessage` (`apps/api/src/modules/notifications/realtime/realtime-channel.port.ts`).
 *
 * Kept as a local type so the web bundle does not depend on `apps/api`.
 * Update both files together when the contract changes.
 */
export interface RealtimeMessage {
  /** `Notification.id` — used for mark-read / hide / RBAC re-check. */
  readonly deliveryId: string;
  /** Optional trip scope; absent for non-trip notifications such as sync failures. */
  readonly tripId?: string;
  /** Notification eventType from the allowlist (e.g. `vehicle_arrived_gate`). */
  readonly eventType: string;
  /** ISO-8601 UTC timestamp of the underlying domain event. */
  readonly occurredAt: string;
  /** Pre-rendered, scrubbed Vietnamese title shown in the inbox. */
  readonly title: string;
  /** Pre-rendered, scrubbed Vietnamese body shown in the inbox. */
  readonly body: string;
}

/**
 * Handler registered via `subscribe`. Called for every broadcast received on
 * the per-user topic, in registration order. Errors thrown by handlers are
 * swallowed so a misbehaving consumer cannot break realtime delivery for the
 * rest of the app.
 */
export type RealtimeMessageHandler = (message: RealtimeMessage) => void;

/**
 * Public shape of the `NotificationProvider` context.
 */
export interface NotificationProviderContextValue {
  /** True once the per-user topic has reported `SUBSCRIBED`. */
  readonly isConnected: boolean;
  /** Most recent message received on the topic, or `null` if none yet. */
  readonly lastMessage: RealtimeMessage | null;
  /**
   * Register an additional handler. Returns an unsubscribe function that
   * removes the handler. Safe to call multiple times.
   */
  subscribe: (handler: RealtimeMessageHandler) => () => void;
}

const NotificationProviderContext = createContext<NotificationProviderContextValue | null>(null);

const RECONNECT_DELAY_MS = 3_000;

export interface NotificationProviderProps {
  /** Authenticated user id. When absent, the provider stays disconnected. */
  readonly userId?: string | undefined;
  /** Active organization id. When absent, the provider stays disconnected. */
  readonly organizationId?: string | undefined;
  readonly children: ReactNode;
}

/**
 * Mounts a Supabase Realtime subscription to the per-user notification topic
 * for the duration of the authenticated session.
 */
export function NotificationProvider({
  userId,
  organizationId,
  children
}: NotificationProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<RealtimeMessage | null>(null);
  const handlersRef = useRef<Set<RealtimeMessageHandler>>(new Set());

  const subscribe = useCallback<NotificationProviderContextValue['subscribe']>((handler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  useEffect(() => {
    if (!userId || !organizationId || !webEnv.hasSupabaseConfig) {
      return;
    }

    let isMounted = true;
    let channel: RealtimeChannel | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const supabase = createBrowserSupabaseClient();
    const topic = `org:${organizationId}:user:${userId}`;

    const dispatch = (message: RealtimeMessage) => {
      if (!isMounted) {
        return;
      }
      setLastMessage(message);
      // Snapshot the set so handlers added/removed during dispatch do not
      // affect the current iteration.
      const handlers = Array.from(handlersRef.current);
      for (const handler of handlers) {
        try {
          handler(message);
        } catch {
          // Swallow handler errors so a single bad subscriber cannot break
          // realtime delivery for the rest of the app.
        }
      }
    };

    const teardownChannel = async () => {
      if (channel) {
        const closing = channel;
        channel = null;
        try {
          await supabase.removeChannel(closing);
        } catch {
          // Removal failures are non-fatal; the channel is being discarded.
        }
      }
    };

    const scheduleReconnect = () => {
      if (!isMounted || reconnectTimer) {
        return;
      }
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        // Force a fresh session lookup on reconnect so an expired JWT is
        // replaced before we re-subscribe.
        clearWebApiSessionCache();
        void teardownChannel().then(() => {
          if (isMounted) {
            void connect();
          }
        });
      }, RECONNECT_DELAY_MS);
    };

    const connect = async () => {
      try {
        const session = await resolveWebApiSession();
        if (!isMounted) {
          return;
        }
        if (session.mode !== 'api') {
          // Dev fallback or no session — stay disconnected without retrying.
          return;
        }

        supabase.realtime.setAuth(session.accessToken);

        const nextChannel = supabase.channel(topic, { config: { private: true } });
        channel = nextChannel;

        nextChannel
          .on('broadcast', { event: '*' }, (payload) => {
            const message = parseRealtimeMessage(extractPayload(payload));
            if (message) {
              dispatch(message);
            }
          })
          .subscribe((status) => {
            if (!isMounted) {
              return;
            }
            if (status === 'SUBSCRIBED') {
              setIsConnected(true);
              return;
            }
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              setIsConnected(false);
              if (status !== 'CLOSED') {
                scheduleReconnect();
              }
            }
          });
      } catch {
        if (isMounted) {
          scheduleReconnect();
        }
      }
    };

    void connect();

    return () => {
      isMounted = false;
      setIsConnected(false);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      void teardownChannel();
    };
  }, [organizationId, userId]);

  const value = useMemo<NotificationProviderContextValue>(
    () => ({ isConnected, lastMessage, subscribe }),
    [isConnected, lastMessage, subscribe]
  );

  return (
    <NotificationProviderContext.Provider value={value}>
      {children}
    </NotificationProviderContext.Provider>
  );
}

/**
 * Hook accessor for the realtime notification context.
 *
 * Throws if used outside of `<NotificationProvider>` so misconfiguration is
 * caught early in development. Components rendered before authentication
 * (e.g. login page) should not call this hook.
 */
export function useNotificationProviderContext(): NotificationProviderContextValue {
  const context = useContext(NotificationProviderContext);
  if (!context) {
    throw new Error('useNotificationProviderContext must be used within <NotificationProvider>.');
  }
  return context;
}

/**
 * Same as `useNotificationProviderContext` but returns `null` when used
 * outside the provider. Useful for components that may be rendered both in
 * authenticated and unauthenticated trees.
 */
export function useOptionalNotificationProviderContext(): NotificationProviderContextValue | null {
  return useContext(NotificationProviderContext);
}

/**
 * Supabase broadcast events arrive shaped as `{ type, event, payload }`.
 * Older / custom emitters may pass the message directly. Normalise to the
 * inner payload object before validation.
 */
function extractPayload(input: unknown): unknown {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const candidate = input as { payload?: unknown };
    if (candidate.payload && typeof candidate.payload === 'object') {
      return candidate.payload;
    }
  }
  return input;
}

/**
 * Parse and validate the broadcast payload into a `RealtimeMessage`.
 * Returns `null` for any malformed input so we never feed garbage to
 * downstream handlers (Requirement 14.x — the channel must remain a
 * trusted source of metadata only).
 */
function parseRealtimeMessage(input: unknown): RealtimeMessage | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  const deliveryId = candidate.deliveryId;
  const eventType = candidate.eventType;
  const occurredAt = candidate.occurredAt;
  const title = candidate.title;
  const body = candidate.body;
  const tripId = candidate.tripId;

  if (
    typeof deliveryId !== 'string' ||
    typeof eventType !== 'string' ||
    typeof occurredAt !== 'string' ||
    typeof title !== 'string' ||
    typeof body !== 'string'
  ) {
    return null;
  }

  return {
    deliveryId,
    eventType,
    occurredAt,
    title,
    body,
    ...(typeof tripId === 'string' && tripId.length > 0 ? { tripId } : {})
  };
}
