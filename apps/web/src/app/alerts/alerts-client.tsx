'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { NoOrganizationState } from '@/components/no-organization-state';
import { gatesyncApi } from '@/lib/api/gatesync';
import { resolveWebApiSession } from '@/lib/api/session';
import type { ApiNotification, ApiNotificationPayload } from '@/lib/api/types';
import { webEnv } from '@/lib/env';
import type { OrganizationAccessIssue } from '@/lib/operations/errors';
import type { DashboardViewData } from '@/lib/operations/view-model';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';
import { tripEventTypeLabels, tripStatusLabels } from '@/lib/ui-labels';

type AlertsClientProps = {
  initialData?: DashboardViewData;
  initialError?: string;
  initialOrganizationIssue?: OrganizationAccessIssue;
};

export function AlertsClient({
  initialData,
  initialError,
  initialOrganizationIssue
}: AlertsClientProps = {}) {
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const unreadCount = notifications.filter((n) => n.status !== 'READ').length;

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);

    try {
      const session = await resolveWebApiSession();

      if (session.mode === 'dev') {
        setNotifications([]);
        return;
      }

      const result = await gatesyncApi.listNotifications({ accessToken: session.accessToken });
      setNotifications(result.filter((n) => n.channel === 'IN_APP'));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Không thể tải thông báo.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    const orgId = initialData?.organization?.id;

    if (!orgId || !webEnv.hasSupabaseConfig) {
      return;
    }

    const supabase = createBrowserSupabaseClient();
    const channel = supabase.channel(`org_${orgId}_events`, {
      config: { private: true }
    });
    let isMounted = true;

    void resolveWebApiSession().then((session) => {
      if (!isMounted || session.mode === 'dev') {
        return;
      }

      supabase.realtime.setAuth(session.accessToken);
      channel
        .on('broadcast', { event: '*' }, () => {
          void loadNotifications();
          toast.info('Có thông báo mới');
        })
        .subscribe();
    });

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [initialData?.organization?.id, loadNotifications]);

  async function markRead(notificationId: string) {
    setNotifications((current) =>
      current.map((n) => (n.id === notificationId ? { ...n, status: 'READ' } : n))
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

  if (initialOrganizationIssue) {
    return <NoOrganizationState issue={initialOrganizationIssue} message={initialError ?? 'Vui lòng chọn tổ chức để xem thông báo.'} />;
  }

  const shellProps = initialData?.organization ? { organization: initialData.organization } : {};

  return (
    <AppShell
      activeNav="dashboard"
      eyebrow="Thông báo"
      title="Cảnh báo vận hành"
      description="Tất cả thông báo realtime từ hệ thống GateSync."
      unreadNotificationCount={unreadCount}
      {...shellProps}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-600">
            {unreadCount > 0 ? `${unreadCount} thông báo chưa đọc` : 'Tất cả đã đọc'}
          </p>
          <button
            type="button"
            onClick={() => void loadNotifications()}
            disabled={isLoading}
            className="rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500 transition hover:text-sky-700 disabled:opacity-50"
          >
            Làm mới
          </button>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
            {error}
          </div>
        ) : null}

        {isLoading && notifications.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : null}

        {notifications.length === 0 && !isLoading ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">
            Chưa có thông báo vận hành.
          </div>
        ) : null}

        {notifications.map((notification) => (
          <AlertItem
            key={notification.id}
            notification={notification}
            onRead={() => void markRead(notification.id)}
          />
        ))}
      </div>
    </AppShell>
  );
}

function AlertItem({
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
  const href = notification.tripId ? `/trips/${notification.tripId}` : '/trips';

  return (
    <div
      className={`rounded-2xl border px-4 py-3 transition ${
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
          {payload.occurredAt ? (
            <p className="mt-1 text-xs text-slate-400">
              {new Intl.DateTimeFormat('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit'
              }).format(new Date(payload.occurredAt))}
            </p>
          ) : null}
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
            Đã đọc
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
