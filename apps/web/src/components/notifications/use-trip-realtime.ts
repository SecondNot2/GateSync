'use client';

/**
 * `useTripRealtime` (task 15.2, requirements 15.2 / 15.3 / 15.4).
 *
 * React hook that wires a per-trip TanStack Query cache invalidator into the
 * shared realtime channel exposed by `<NotificationProvider>` (task 15.1).
 *
 * Behaviour
 * ---------
 * - Reads the realtime subscribe API via `useNotificationProviderContext()`.
 * - Registers a handler that runs for every `RealtimeMessage` received on the
 *   per-user topic `org:{orgId}:user:{userId}`.
 * - Acts only when `message.tripId === tripId` (Requirement 15.2). Messages
 *   for other trips (or non-trip notifications such as integration sync
 *   failures) are ignored.
 * - On match, invalidates the TanStack Query keys
 *   `['trips', tripId]`, `['trip-events', tripId]`, and the notifications
 *   inbox prefix `['notifications']` (Requirement 15.3 / 15.4).
 * - Local RBAC suppression (Property 26 / Requirement 15.4): if the caller
 *   passes `options.canView === false`, no UI mutation is performed for that
 *   trip — no query is invalidated and no trip refetch is triggered. The
 *   server remains the authoritative gate (`/api/v1/notifications/{id}`,
 *   `GET /api/v1/trips/{tripId}` re-check RBAC and respond `FORBIDDEN`).
 *
 * The hook intentionally has no return value: it is a side-effecting
 * subscription tied to the calling component's lifetime.
 *
 * Usage
 * -----
 * ```tsx
 * useTripRealtime(tripId);
 * useTripRealtime(tripId, { canView: currentUser.canReadTrips });
 * ```
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  useNotificationProviderContext,
  type RealtimeMessage
} from '@/components/notifications/notification-provider';

/**
 * Optional behaviour overrides. The documented signature is
 * `useTripRealtime(tripId: string)` — every option is optional and only
 * affects edge cases.
 */
export interface UseTripRealtimeOptions {
  /**
   * Local RBAC snapshot for this trip. When `false`, the hook never
   * invalidates query caches for this trip even if a matching realtime
   * message arrives. Defaults to `true` because the server is the
   * authoritative RBAC gate; flagging this `false` is purely an
   * optimisation that avoids triggering forbidden trip refetches.
   */
  readonly canView?: boolean;
}

/**
 * Subscribe a component to realtime updates for a single trip.
 *
 * @param tripId  The trip whose caches should be invalidated when matching
 *                realtime messages arrive. An empty string disables the hook
 *                so it can be called unconditionally during render.
 * @param options Optional behaviour overrides — see `UseTripRealtimeOptions`.
 */
export function useTripRealtime(tripId: string, options: UseTripRealtimeOptions = {}): void {
  const { subscribe } = useNotificationProviderContext();
  const queryClient = useQueryClient();
  const canView = options.canView ?? true;

  useEffect(() => {
    // Skip wiring entirely when there is no trip context or when the local
    // RBAC snapshot already says the user cannot view this trip. This keeps
    // Property 26 ("no UI mutation occurs and no trip data fetch is
    // triggered for T") trivially true for forbidden trips.
    if (!tripId || !canView) {
      return;
    }

    const handler = (message: RealtimeMessage) => {
      if (message.tripId !== tripId) {
        return;
      }

      // Invalidate the trip detail and timeline queries so any mounted
      // `trip-detail-client` / timeline view refetches with fresh data. We
      // use the prefix form so callers may extend the keys with extra
      // qualifiers (e.g. `['trips', tripId, 'summary']`) without missing
      // invalidations.
      void queryClient.invalidateQueries({ queryKey: ['trips', tripId] });
      void queryClient.invalidateQueries({ queryKey: ['trip-events', tripId] });

      // Invalidate every notifications inbox query regardless of the
      // org/user/pageSize tail (`notification-center.tsx` keys are
      // `['notifications', orgId, userId, pageSize]`).
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };

    return subscribe(handler);
  }, [tripId, canView, subscribe, queryClient]);
}
