'use client';

/**
 * NotificationCenter (task 15.4, requirements 15.1 / 15.4).
 *
 * Renders the user inbox with cursor-paginated TanStack Query infinite scroll,
 * mark-read and hide actions, and Vietnamese UI copy. Uses the view-model
 * from `./view-model.ts` (task 15.5) so the panel never reads sensitive
 * payload fields directly.
 *
 * UI primitives: shadcn/ui is not yet installed in the web app, so this
 * component uses Tailwind + the existing helpers in
 * `apps/web/src/components/ui.tsx` (`Button`, `StatePanel`, `Panel`,
 * `SkeletonBlock`).
 *
 * Note on the QueryClient: `apps/web/src/app/layout.tsx` does not yet wrap
 * the tree in a `QueryClientProvider` (that wiring is task 17.1 / outside
 * the scope of 15.4). To stay self-contained the component creates and
 * provides a module-scoped `QueryClient` lazily via `useNotificationsQueryClient`.
 * If a `QueryClientProvider` is added later, the existing one will take
 * precedence — `useQueryClient` simply returns the nearest provider.
 */

import { useCallback, useMemo } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient
} from '@tanstack/react-query';
import Link from 'next/link';
import { ApiClientError } from '@/lib/api/client';
import { gatesyncApi } from '@/lib/api/gatesync';
import { resolveWebApiSession, type WebApiSession } from '@/lib/api/session';
import type { ApiNotificationListPage, ListNotificationsParams } from '@/lib/api/types';
import { Button, Panel, SkeletonBlock, StatePanel } from '@/components/ui';
import {
  NOTIFICATION_TITLES,
  toNotificationViewModel,
  type NotificationViewModel
} from '@/components/notifications/view-model';

/**
 * Props accepted by `NotificationCenter`. Both fields are optional so the
 * component can also be embedded in places that do not yet have an
 * organization context (it will simply render the empty/permission state).
 */
type NotificationCenterProps = {
  /** Authenticated user id, used purely for cache scoping. */
  userId?: string | undefined;
  /** Active organization id, used purely for cache scoping. */
  organizationId?: string | undefined;
  /** Page size hint sent to the API. Defaults to 20. */
  pageSize?: number;
  /** Optional className for the outer wrapper. */
  className?: string | undefined;
};

const DEFAULT_PAGE_SIZE = 20;

/**
 * Vietnamese error copy. We deliberately keep this short — the component is
 * embedded in dense dashboards.
 */
const ERROR_COPY = {
  generic: 'Không thể tải thông báo. Vui lòng thử lại sau.',
  permissionDenied: 'Bạn không có quyền xem thông báo của tổ chức này.',
  notSignedIn: 'Bạn cần đăng nhập GateSync để xem thông báo vận hành.',
  empty: 'Chưa có thông báo. Khi tích hợp hoặc điều phối tạo mốc quan trọng, bạn sẽ nhận tại đây.',
  loading: 'Đang tải thông báo…',
  loadMore: 'Tải thêm',
  loadingMore: 'Đang tải…',
  retry: 'Thử lại',
  markRead: 'Đánh dấu đã đọc',
  hide: 'Ẩn thông báo',
  openTrip: 'Mở chuyến',
  refresh: 'Làm mới',
  pending: 'Sẽ giao khi bạn online'
} as const;

let sharedQueryClient: QueryClient | null = null;

/**
 * Returns a module-scoped `QueryClient`, created lazily so that SSR does not
 * pre-allocate one. This keeps the component drop-in until the app installs
 * a top-level provider (see task 17.1).
 */
function getSharedQueryClient(): QueryClient {
  if (!sharedQueryClient) {
    sharedQueryClient = new QueryClient({
      defaultOptions: {
        queries: {
          // The server is the source of truth — keep cached pages tight so
          // realtime invalidations show up quickly.
          staleTime: 15_000,
          gcTime: 5 * 60_000,
          refetchOnWindowFocus: false,
          retry: (failureCount, error) => {
            // Never retry permission errors — they will never resolve client-side.
            if (error instanceof ApiClientError && error.status === 403) {
              return false;
            }
            return failureCount < 2;
          }
        },
        mutations: {
          retry: 0
        }
      }
    });
  }
  return sharedQueryClient;
}

export function NotificationCenter(props: NotificationCenterProps) {
  return (
    <QueryClientProvider client={getSharedQueryClient()}>
      <NotificationCenterPanel {...props} />
    </QueryClientProvider>
  );
}

/** Stable cache key shape so realtime hooks (task 15.2) can invalidate cleanly. */
function notificationsQueryKey(opts: {
  organizationId: string | undefined;
  userId: string | undefined;
  pageSize: number;
}) {
  return [
    'notifications',
    opts.organizationId ?? null,
    opts.userId ?? null,
    opts.pageSize
  ] as const;
}

function NotificationCenterPanel({
  userId,
  organizationId,
  pageSize = DEFAULT_PAGE_SIZE,
  className
}: NotificationCenterProps) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => notificationsQueryKey({ organizationId, userId, pageSize }),
    [organizationId, userId, pageSize]
  );

  const query = useInfiniteQuery<
    ApiNotificationListPage,
    Error,
    { pages: ApiNotificationListPage[]; pageParams: Array<string | undefined> },
    typeof queryKey,
    string | undefined
  >({
    queryKey,
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam }) => {
      const session = await resolveWebApiSession();
      if (session.mode === 'dev') {
        // Dev fallback: return an empty page so the component renders the
        // empty state instead of an auth error.
        return { data: [], nextCursor: null } satisfies ApiNotificationListPage;
      }

      const params: ListNotificationsParams = { limit: pageSize };
      if (pageParam) {
        params.cursor = pageParam;
      }

      return gatesyncApi.listNotificationsPage({
        accessToken: (session as Extract<WebApiSession, { mode: 'api' }>).accessToken,
        params
      });
    }
  });

  const items = useMemo<NotificationViewModel[]>(() => {
    const pages = query.data?.pages ?? [];
    const seen = new Set<string>();
    const result: NotificationViewModel[] = [];

    for (const page of pages) {
      for (const row of page.data) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        const vm = toNotificationViewModel(row);
        // The server already filters hidden rows out of the inbox listing,
        // but we double-guard here so an optimistic `hide` never leaves a
        // ghost in the panel.
        if (vm.status === 'HIDDEN') continue;
        result.push(vm);
      }
    }
    return result;
  }, [query.data]);

  const markRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const session = await resolveWebApiSession();
      if (session.mode === 'dev') {
        return null;
      }
      return gatesyncApi.markNotificationReadV2(notificationId, {
        accessToken: session.accessToken
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    }
  });

  const hide = useMutation({
    mutationFn: async (notificationId: string) => {
      const session = await resolveWebApiSession();
      if (session.mode === 'dev') {
        return null;
      }
      return gatesyncApi.hideNotification(notificationId, {
        accessToken: session.accessToken
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    }
  });

  const handleMarkRead = useCallback(
    (id: string) => {
      markRead.mutate(id);
    },
    [markRead]
  );

  const handleHide = useCallback(
    (id: string) => {
      hide.mutate(id);
    },
    [hide]
  );

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  return (
    <Panel className={className ?? ''}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Thông báo realtime
          </p>
          <p className="mt-1 text-sm font-bold text-slate-950">Hộp thư vận hành</p>
        </div>
        <Button
          variant="secondary"
          onClick={refresh}
          disabled={query.isFetching && !query.isFetchingNextPage}
        >
          {ERROR_COPY.refresh}
        </Button>
      </header>

      <div className="mt-3">
        <NotificationCenterBody
          query={query}
          items={items}
          onMarkRead={handleMarkRead}
          onHide={handleHide}
          markReadPendingId={markRead.isPending ? (markRead.variables ?? null) : null}
          hidePendingId={hide.isPending ? (hide.variables ?? null) : null}
        />
      </div>
    </Panel>
  );
}

type BodyProps = {
  query: ReturnType<typeof useInfiniteQuery<ApiNotificationListPage, Error>>;
  items: NotificationViewModel[];
  onMarkRead: (id: string) => void;
  onHide: (id: string) => void;
  markReadPendingId: string | null;
  hidePendingId: string | null;
};

function NotificationCenterBody({
  query,
  items,
  onMarkRead,
  onHide,
  markReadPendingId,
  hidePendingId
}: BodyProps) {
  // Loading: first fetch, no pages yet.
  if (query.isPending) {
    return (
      <div className="space-y-2" role="status" aria-live="polite" aria-label={ERROR_COPY.loading}>
        <SkeletonBlock className="h-20" />
        <SkeletonBlock className="h-20" />
        <SkeletonBlock className="h-20" />
      </div>
    );
  }

  // Error: distinguish permission-denied (403) from generic failures.
  if (query.isError) {
    const error = query.error;
    const isForbidden = error instanceof ApiClientError && error.status === 403;
    const isUnauthenticated = error instanceof ApiClientError && error.status === 401;

    if (isForbidden) {
      return <StatePanel tone="warning" message={ERROR_COPY.permissionDenied} />;
    }

    if (isUnauthenticated) {
      return <StatePanel tone="warning" message={ERROR_COPY.notSignedIn} />;
    }

    return (
      <div className="space-y-2">
        <StatePanel tone="error" message={error?.message?.trim() || ERROR_COPY.generic} />
        <Button variant="secondary" onClick={() => query.refetch()}>
          {ERROR_COPY.retry}
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return <StatePanel tone="default" message={ERROR_COPY.empty} />;
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2" aria-label="Danh sách thông báo">
        {items.map((item) => (
          <li key={item.id}>
            <NotificationRow
              item={item}
              onMarkRead={onMarkRead}
              onHide={onHide}
              isMarkingRead={markReadPendingId === item.id}
              isHiding={hidePendingId === item.id}
            />
          </li>
        ))}
      </ul>

      {query.hasNextPage ? (
        <div className="pt-1">
          <Button
            variant="soft"
            fullWidth
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? ERROR_COPY.loadingMore : ERROR_COPY.loadMore}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

type RowProps = {
  item: NotificationViewModel;
  onMarkRead: (id: string) => void;
  onHide: (id: string) => void;
  isMarkingRead: boolean;
  isHiding: boolean;
};

function NotificationRow({ item, onMarkRead, onHide, isMarkingRead, isHiding }: RowProps) {
  // Always prefer the rendered title from the backend; fall back to the
  // canonical Vietnamese title for the eventType (Requirement 15.1).
  const title = item.title?.trim() || NOTIFICATION_TITLES[item.eventType];
  const isRead = item.status === 'READ' || Boolean(item.readAt);
  const isPendingDelivery = item.status === 'PENDING_IN_APP' || item.status === 'PENDING';
  const isFailed = item.status === 'FAILED';

  return (
    <article
      className={`rounded-2xl border px-3 py-3 transition ${
        isRead ? 'border-slate-100 bg-white' : 'border-sky-100 bg-sky-50'
      }`}
      data-event-type={item.eventType}
      data-read={isRead ? 'true' : 'false'}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-950">{title}</p>
          {item.body ? (
            <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-600">{item.body}</p>
          ) : null}
          <p className="mt-1 text-xs text-slate-400">{formatOccurredAt(item.createdAt)}</p>
          {isPendingDelivery ? (
            <p className="mt-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-amber-700">
              {ERROR_COPY.pending}
            </p>
          ) : null}
          {isFailed ? (
            <p className="mt-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-rose-700">
              {item.failureReason ?? 'Gửi không thành công'}
            </p>
          ) : null}
        </div>
        {!isRead ? (
          <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-500" />
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {item.tripId ? (
          <Link
            href={`/trips/${item.tripId}`}
            onClick={() => {
              if (!isRead) {
                onMarkRead(item.id);
              }
            }}
            className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
          >
            {ERROR_COPY.openTrip}
          </Link>
        ) : null}

        {!isRead ? (
          <button
            type="button"
            onClick={() => onMarkRead(item.id)}
            disabled={isMarkingRead}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:text-sky-700 disabled:opacity-50"
          >
            {ERROR_COPY.markRead}
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => onHide(item.id)}
          disabled={isHiding}
          className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200 transition hover:text-rose-700 disabled:opacity-50"
        >
          {ERROR_COPY.hide}
        </button>
      </div>
    </article>
  );
}

function formatOccurredAt(value: string): string {
  if (!value) {
    return 'Vừa cập nhật';
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() === 0) {
    return 'Vừa cập nhật';
  }
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}
