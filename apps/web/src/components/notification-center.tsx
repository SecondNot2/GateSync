'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { gatesyncApi } from '@/lib/api/gatesync';
import { resolveWebApiSession } from '@/lib/api/session';
import type { ApiNotification, ApiNotificationPayload } from '@/lib/api/types';
import { webEnv } from '@/lib/env';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';
import { tripEventTypeLabels, tripStatusLabels } from '@/lib/ui-labels';

type NotificationCenterProps = {
  userId?: string | undefined;
  organizationId?: string | undefined;
};

const lastSeenKey = 'gatesync_notifications_lastSeenAt';

export function NotificationCenter({ userId, organizationId }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const latestLoadedAtRef = useRef(0);
  const unreadCount = notifications.filter((notification) => notification.status !== 'READ').length;

  const loadNotifications = useCallback(async () => {
    if (!userId) {
      return;
    }

    setIsLoading(true);
    setError(undefined);

    try {
      const session = await resolveWebApiSession();

      if (session.mode === 'dev') {
        setNotifications([]);
        return;
      }

      const result = await gatesyncApi.listNotifications({ accessToken: session.accessToken });
      setNotifications(result.filter((notification) => notification.channel === 'IN_APP'));
      latestLoadedAtRef.current = Date.now();

      try {
        sessionStorage.setItem(lastSeenKey, new Date().toISOString());
      } catch {
        // sessionStorage may be unavailable
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Không thể tải thông báo.');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const loadMissedNotifications = useCallback(async () => {
    if (!userId) {
      return;
    }

    try {
      const session = await resolveWebApiSession();

      if (session.mode === 'dev') {
        return;
      }

      let after: string | undefined;

      try {
        after = sessionStorage.getItem(lastSeenKey) ?? undefined;
      } catch {
        // sessionStorage may be unavailable
      }

      const result = await gatesyncApi.listNotifications({
        accessToken: session.accessToken,
        ...(after ? { after } : {})
      });
      const inApp = result.filter((notification) => notification.channel === 'IN_APP');

      if (inApp.length > 0) {
        setNotifications((current) => {
          const existingIds = new Set(current.map((n) => n.id));
          const newOnes = inApp.filter((n) => !existingIds.has(n.id));
          return [...newOnes, ...current];
        });
      }

      try {
        sessionStorage.setItem(lastSeenKey, new Date().toISOString());
      } catch {
        // sessionStorage may be unavailable
      }
    } catch {
      // Silent fail for missed notifications — full reload available via button
    }
  }, [userId]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!userId || !organizationId || !webEnv.hasSupabaseConfig) {
      return;
    }

    const supabase = createBrowserSupabaseClient();
    const channel = supabase.channel(`org_${organizationId}_events`, {
      config: {
        private: true
      }
    });
    let isMounted = true;

    void resolveWebApiSession().then((session) => {
      if (!isMounted || session.mode === 'dev') {
        return;
      }

      supabase.realtime.setAuth(session.accessToken);
      channel
        .on(
          'broadcast',
          {
            event: '*'
          },
          () => {
            void loadMissedNotifications();
            toast.info('Có thông báo mới', {
              action: {
                label: 'Xem',
                onClick: () => setIsOpen(true)
              }
            });
          }
        )
        .subscribe();
    });

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [loadMissedNotifications, organizationId, userId]);

  async function markRead(notificationId: string) {
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId ? { ...notification, status: 'READ' } : notification
      )
    );

    try {
      const session = await resolveWebApiSession();

      if (session.mode === 'dev') {
        return;
      }

      await gatesyncApi.markNotificationRead(notificationId, { accessToken: session.accessToken });
    } catch {
      await loadNotifications();
    }
  }

  async function markAllNotificationsRead() {
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, status: 'READ' }))
    );

    try {
      const session = await resolveWebApiSession();

      if (session.mode === 'dev') {
        return;
      }

      await gatesyncApi.markAllNotificationsRead({ accessToken: session.accessToken });
    } catch {
      await loadNotifications();
    }
  }

  async function clearNotifications() {
    const previous = notifications;
    setNotifications([]);

    try {
      const session = await resolveWebApiSession();

      if (session.mode === 'dev') {
        return;
      }

      await gatesyncApi.clearNotifications({ accessToken: session.accessToken });
      toast.success('Đã xóa tất cả thông báo');
    } catch {
      setNotifications(previous);
      toast.error('Không thể xóa thông báo');
    }
  }

  const statusLabel = useMemo(() => {
    if (isLoading && notifications.length === 0) {
      return 'Đang tải thông báo...';
    }

    if (unreadCount > 0) {
      return `${unreadCount} thông báo mới`;
    }

    return latestLoadedAtRef.current ? 'Không có thông báo mới' : 'Thông báo vận hành';
  }, [isLoading, notifications.length, unreadCount]);

  return (
    <details
      className="relative"
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="relative flex min-h-11 cursor-pointer list-none items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-soft transition hover:border-sky-300 hover:text-sky-700">
        <span className="sr-only">Mở thông báo</span>
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[0.68rem] font-bold text-white ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </summary>
      <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(22rem,calc(100vw-1.5rem))] rounded-3xl border border-slate-200 bg-white p-3 text-left shadow-2xl shadow-slate-950/10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Thông báo realtime
            </p>
            <p className="mt-1 text-sm font-bold text-slate-950">{statusLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => void loadNotifications()}
            disabled={isLoading}
            className="rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500 transition hover:text-sky-700 disabled:opacity-50"
          >
            Làm mới
          </button>
        </div>
        {notifications.length > 0 ? (
          <div className="mt-3 flex items-center gap-2 border-b border-slate-100 pb-3">
            <button
              type="button"
              onClick={() => void markAllNotificationsRead()}
              className="flex items-center gap-1.5 rounded-xl bg-sky-50 px-2.5 py-1.5 text-xs font-bold text-sky-700 transition hover:bg-sky-100"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Đã xem tất cả
            </button>
            <button
              type="button"
              onClick={() => void clearNotifications()}
              className="flex items-center gap-1.5 rounded-xl bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              Xóa tất cả
            </button>
          </div>
        ) : null}
        {error ? (
          <div className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
            {error}
          </div>
        ) : null}
        <div className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
          {notifications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
              Chưa có thông báo vận hành. Khi CKS hoặc điều phối tạo mốc quan trọng, nhân sự liên
              quan sẽ nhận tại đây.
            </div>
          ) : null}
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onRead={() => void markRead(notification.id)}
            />
          ))}
        </div>
      </div>
    </details>
  );
}

function NotificationItem({
  notification,
  onRead
}: {
  notification: ApiNotification;
  onRead: () => void;
}) {
  const payload = normalizePayload(notification.payload);
  const isUnread = notification.status !== 'READ';
  const eventLabel =
    payload.title ??
    (payload.eventType ? tripEventTypeLabels[payload.eventType] : 'Cập nhật vận hành');
  const statusLabel = payload.currentStatus ? tripStatusLabels[payload.currentStatus] : undefined;
  const occurredAt = payload.occurredAt ? formatNotificationTime(payload.occurredAt) : undefined;
  const href = notification.tripId ? `/trips/${notification.tripId}` : '/trips';

  return (
    <div
      className={`rounded-2xl border px-3 py-3 transition ${
        isUnread ? 'border-sky-100 bg-sky-50' : 'border-slate-100 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-950">{eventLabel}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {payload.message ??
              (notification.trip?.tripCode
                ? `Chuyến ${notification.trip.tripCode}${statusLabel ? ` chuyển sang ${statusLabel}` : ''}.`
                : statusLabel
                  ? `Trạng thái mới: ${statusLabel}.`
                  : 'Có cập nhật mới cần theo dõi.')}
          </p>
          {occurredAt ? <p className="mt-1 text-xs text-slate-400">{occurredAt}</p> : null}
        </div>
        {isUnread ? <span className="mt-1 h-2 w-2 rounded-full bg-sky-500" /> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={href}
          onClick={onRead}
          className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
        >
          Mở chuyến
        </Link>
        {isUnread ? (
          <button
            type="button"
            onClick={onRead}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:text-sky-700"
          >
            Xem nhanh
          </button>
        ) : null}
      </div>
    </div>
  );
}

function normalizePayload(payload: ApiNotification['payload']): ApiNotificationPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }

  return payload as ApiNotificationPayload;
}

function formatNotificationTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Vừa cập nhật';
  }

  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit'
  }).format(date);
}
