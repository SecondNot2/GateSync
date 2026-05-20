'use client';

import {
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
  useQueryClient
} from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button, DateInput, Panel, SelectInput, StatePanel } from '@/components/ui';
import { gatesyncApi } from '@/lib/api/gatesync';
import { resolveWebApiSession } from '@/lib/api/session';
import type {
  ApiIntegrationSyncRun,
  ApiIntegrationSyncRunsPage,
  ListIntegrationSyncRunsParams
} from '@/lib/api/types';

type SyncRunsClientProps = {
  initialData?: ApiIntegrationSyncRunsPage;
  initialError?: string;
};

type ProviderFilter = '' | 'CUA_KHAU_SO' | 'XUAN_CUONG' | 'GPS_PROVIDER' | 'MOCK';

type StatusFilter =
  | ''
  | 'QUEUED'
  | 'RUNNING'
  | 'RETRYING'
  | 'SUCCEEDED'
  | 'PARTIAL'
  | 'FAILED'
  | 'TIMEOUT';

type FiltersState = {
  provider: ProviderFilter;
  status: StatusFilter;
  from: string;
  to: string;
};

const emptyFilters: FiltersState = {
  provider: '',
  status: '',
  from: '',
  to: ''
};

const PAGE_SIZE = 50;

const providerLabels: Record<Exclude<ProviderFilter, ''>, string> = {
  CUA_KHAU_SO: 'Cửa khẩu số',
  XUAN_CUONG: 'Bãi Xuân Cương (yard)',
  GPS_PROVIDER: 'Định vị GPS',
  MOCK: 'Mô phỏng (mock)'
};

const providerOptions: Array<{ value: ProviderFilter; label: string }> = [
  { value: '', label: 'Tất cả nhà cung cấp' },
  { value: 'CUA_KHAU_SO', label: providerLabels.CUA_KHAU_SO },
  { value: 'XUAN_CUONG', label: providerLabels.XUAN_CUONG },
  { value: 'GPS_PROVIDER', label: providerLabels.GPS_PROVIDER },
  { value: 'MOCK', label: providerLabels.MOCK }
];

const statusLabels: Record<Exclude<StatusFilter, ''>, string> = {
  QUEUED: 'Trong hàng đợi',
  RUNNING: 'Đang chạy',
  RETRYING: 'Đang thử lại',
  SUCCEEDED: 'Đã thành công',
  PARTIAL: 'Một phần thành công',
  FAILED: 'Thất bại',
  TIMEOUT: 'Quá thời gian'
};

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'QUEUED', label: statusLabels.QUEUED },
  { value: 'RUNNING', label: statusLabels.RUNNING },
  { value: 'RETRYING', label: statusLabels.RETRYING },
  { value: 'SUCCEEDED', label: statusLabels.SUCCEEDED },
  { value: 'PARTIAL', label: statusLabels.PARTIAL },
  { value: 'FAILED', label: statusLabels.FAILED },
  { value: 'TIMEOUT', label: statusLabels.TIMEOUT }
];

const statusToneClassName: Record<Exclude<StatusFilter, ''>, string> = {
  QUEUED: 'bg-slate-100 text-slate-700',
  RUNNING: 'bg-sky-100 text-sky-700',
  RETRYING: 'bg-amber-100 text-amber-800',
  SUCCEEDED: 'bg-emerald-100 text-emerald-700',
  PARTIAL: 'bg-amber-100 text-amber-800',
  FAILED: 'bg-rose-100 text-rose-700',
  TIMEOUT: 'bg-rose-100 text-rose-700'
};

const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});

const SYNC_RUNS_QUERY_KEY = ['admin', 'integration-sync-runs'] as const;

/**
 * Outer wrapper that owns a dedicated `QueryClient` for this admin page.
 *
 * The web app does not yet provide a global `QueryClientProvider`, so each
 * TanStack Query feature scopes its own client. Initial data from the server
 * is hydrated into the cache so the first paint matches SSR output.
 */
export function SyncRunsClient(props: SyncRunsClientProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Sync runs change frequently (workers retry within seconds).
            // Keep cache fresh but allow brief reuse to avoid double-fetch on mount.
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: 1
          }
        }
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SyncRunsContent {...props} />
    </QueryClientProvider>
  );
}

function SyncRunsContent({ initialData, initialError }: SyncRunsClientProps) {
  const [filters, setFilters] = useState<FiltersState>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<FiltersState>(emptyFilters);
  const [filterError, setFilterError] = useState<string>();
  const queryClient = useQueryClient();

  const queryKey = useMemo(
    () => [...SYNC_RUNS_QUERY_KEY, appliedFilters] as const,
    [appliedFilters]
  );

  const initialPage: ApiIntegrationSyncRunsPage | undefined = useMemo(
    () =>
      initialData ? { data: initialData.data, nextCursor: initialData.nextCursor } : undefined,
    [initialData]
  );

  const hasNoFiltersApplied =
    appliedFilters.provider === '' &&
    appliedFilters.status === '' &&
    appliedFilters.from === '' &&
    appliedFilters.to === '';

  const query = useInfiniteQuery<
    ApiIntegrationSyncRunsPage,
    Error,
    { pages: ApiIntegrationSyncRunsPage[]; pageParams: Array<string | undefined> },
    typeof queryKey,
    string | undefined
  >({
    queryKey,
    initialPageParam: undefined,
    queryFn: async ({ pageParam }) => {
      const session = await resolveWebApiSession();

      if (session.mode === 'dev') {
        return { data: [], nextCursor: null };
      }

      const params = buildParams(pageParam, appliedFilters);
      return gatesyncApi.listIntegrationSyncRuns(params, { accessToken: session.accessToken });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    ...(hasNoFiltersApplied && initialPage
      ? {
          initialData: {
            pages: [initialPage],
            pageParams: [undefined]
          }
        }
      : {})
  });

  const rows = useMemo<ApiIntegrationSyncRun[]>(
    () => (query.data?.pages ?? []).flatMap((page) => page.data),
    [query.data]
  );

  const errorMessage = query.error
    ? query.error.message || 'Không thể tải lịch sử đồng bộ tích hợp.'
    : (filterError ?? initialError);

  const isInitialLoading = query.isPending && !initialData;
  const isRefreshing = query.isFetching && !query.isFetchingNextPage;

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        appliedFilters.provider || appliedFilters.status || appliedFilters.from || appliedFilters.to
      ),
    [appliedFilters]
  );

  function handleApply() {
    const validation = validateRange(filters.from, filters.to);
    if (validation) {
      setFilterError(validation);
      return;
    }
    setFilterError(undefined);
    setAppliedFilters(filters);
  }

  function handleReset() {
    setFilterError(undefined);
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
  }

  async function handleReload() {
    await queryClient.invalidateQueries({ queryKey: SYNC_RUNS_QUERY_KEY });
  }

  return (
    <AppShell
      activeNav="admin"
      eyebrow="Quản trị nội bộ"
      title="Lịch sử đồng bộ tích hợp"
      description="Theo dõi các lần chạy AUTO SYNC theo nhà cung cấp, trạng thái và khoảng thời gian. Thông điệp lỗi đã được che các trường nhạy cảm trước khi trả về."
      action={
        <Button
          type="button"
          variant="secondary"
          onClick={() => void handleReload()}
          disabled={isRefreshing}
        >
          {isRefreshing ? 'Đang tải lại...' : 'Tải lại dữ liệu'}
        </Button>
      }
    >
      <Panel>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto_auto] xl:items-end">
          <SelectInput
            label="Đồng bộ"
            value={filters.provider}
            options={providerOptions}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                provider: event.target.value as ProviderFilter
              }))
            }
          />
          <SelectInput
            label="Trạng thái"
            value={filters.status}
            options={statusOptions}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: event.target.value as StatusFilter
              }))
            }
          />
          <DateInput
            label="Từ ngày"
            value={filters.from}
            onChange={(event) =>
              setFilters((current) => ({ ...current, from: event.target.value }))
            }
          />
          <DateInput
            label="Đến ngày"
            value={filters.to}
            onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
          />
          <Button type="button" variant="primary" onClick={handleApply} disabled={isRefreshing}>
            Áp dụng bộ lọc
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handleReset}
            disabled={
              isRefreshing &&
              !hasActiveFilters &&
              filters.provider === '' &&
              filters.status === '' &&
              filters.from === '' &&
              filters.to === ''
            }
          >
            Đặt lại
          </Button>
        </div>
        {filterError ? (
          <p className="mt-3 text-sm font-semibold text-rose-700">{filterError}</p>
        ) : null}
      </Panel>

      {errorMessage ? <StatePanel tone="error" message={errorMessage} /> : null}

      {isInitialLoading ? (
        <StatePanel tone="loading" message="Đang tải lịch sử đồng bộ tích hợp..." />
      ) : rows.length === 0 && !errorMessage ? (
        <StatePanel
          message={
            hasActiveFilters
              ? 'Không có lần chạy nào khớp với bộ lọc đã chọn.'
              : 'Chưa có lần chạy đồng bộ nào được ghi nhận cho tổ chức của bạn.'
          }
        />
      ) : (
        <Panel className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Đồng bộ</th>
                  <th className="px-4 py-3">Tài khoản tích hợp</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Số bản ghi</th>
                  <th className="px-4 py-3">Lỗi</th>
                  <th className="px-4 py-3">Bắt đầu</th>
                  <th className="px-4 py-3">Kết thúc</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {rows.map((row) => (
                  <SyncRunRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col items-stretch justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center">
            <span>
              Hiển thị {rows.length} lần chạy
              {hasActiveFilters ? ' khớp bộ lọc' : ''}.
            </span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void query.fetchNextPage()}
              disabled={!query.hasNextPage || query.isFetchingNextPage}
            >
              {query.hasNextPage
                ? query.isFetchingNextPage
                  ? 'Đang tải thêm...'
                  : 'Tải thêm'
                : 'Đã tải hết kết quả'}
            </Button>
          </div>
        </Panel>
      )}
    </AppShell>
  );
}

function SyncRunRow({ row }: { row: ApiIntegrationSyncRun }) {
  const providerKey = row.integrationAccount?.provider as ProviderFilter | undefined;
  const providerLabel =
    providerKey && providerKey in providerLabels
      ? providerLabels[providerKey as Exclude<ProviderFilter, ''>]
      : (row.integrationAccount?.provider ?? 'Không xác định');

  const accountLabel =
    row.integrationAccount?.label ??
    row.integrationAccount?.accountName ??
    row.integrationAccountId;

  const statusKey = row.status as Exclude<StatusFilter, ''>;
  const statusLabel = statusLabels[statusKey] ?? row.status;
  const statusTone = statusToneClassName[statusKey] ?? 'bg-slate-100 text-slate-700';
  const attemptIndex = typeof row.attemptIndex === 'number' ? row.attemptIndex : 0;

  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <p className="font-semibold text-slate-900">{providerLabel}</p>
        <p className="mt-1 text-xs text-slate-500">
          Lần thử thứ {attemptIndex + 1}
          {row.mode ? ` · ${formatMode(row.mode)}` : ''}
        </p>
      </td>
      <td className="px-4 py-3 text-slate-700">{accountLabel}</td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone}`}
        >
          {statusLabel}
        </span>
        {row.nextRetryAt ? (
          <p className="mt-1 text-xs text-slate-500">
            Thử lại lúc {formatTimestamp(row.nextRetryAt)}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-700">
          <dt className="text-slate-500">Đã đọc</dt>
          <dd className="text-right tabular-nums font-semibold text-slate-800">
            {formatNumber(row.recordsFetched)}
          </dd>
          <dt className="text-slate-500">Tạo mới</dt>
          <dd className="text-right tabular-nums font-semibold text-emerald-700">
            {formatNumber(row.eventsCreated)}
          </dd>
          <dt className="text-slate-500">Bỏ qua</dt>
          <dd className="text-right tabular-nums font-semibold text-slate-700">
            {formatNumber(row.eventsSkipped)}
          </dd>
          <dt className="text-slate-500">Từ chối</dt>
          <dd className="text-right tabular-nums font-semibold text-rose-700">
            {formatNumber(row.recordsRejected ?? 0)}
          </dd>
        </dl>
      </td>
      <td className="px-4 py-3 text-slate-700">
        {row.errorCode || row.errorMessage ? (
          <div className="space-y-1">
            {row.errorCode ? (
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-rose-700">
                {row.errorCode}
                {typeof row.httpStatus === 'number' ? ` · HTTP ${row.httpStatus}` : ''}
              </p>
            ) : null}
            {row.errorMessage ? (
              <p className="whitespace-pre-wrap text-xs leading-5 text-slate-600">
                {row.errorMessage}
              </p>
            ) : null}
          </div>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-slate-700">{formatTimestamp(row.startedAt)}</td>
      <td className="px-4 py-3 text-slate-700">{formatTimestamp(row.finishedAt)}</td>
    </tr>
  );
}

function buildParams(
  cursor: string | undefined,
  current: FiltersState
): ListIntegrationSyncRunsParams {
  const params: ListIntegrationSyncRunsParams = { limit: PAGE_SIZE };

  if (cursor) {
    params.cursor = cursor;
  }
  if (current.provider) {
    params.provider = current.provider;
  }
  if (current.status) {
    params.status = current.status;
  }

  const fromIso = toBoundaryIso(current.from, 'start');
  if (fromIso) {
    params.from = fromIso;
  }

  const toIso = toBoundaryIso(current.to, 'end');
  if (toIso) {
    params.to = toIso;
  }

  return params;
}

function toBoundaryIso(value: string, boundary: 'start' | 'end'): string | undefined {
  if (!value) {
    return undefined;
  }

  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return undefined;
  }

  const date =
    boundary === 'start'
      ? new Date(year, month - 1, day, 0, 0, 0, 0)
      : new Date(year, month - 1, day, 23, 59, 59, 999);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

function validateRange(from: string, to: string): string | undefined {
  if (!from || !to) {
    return undefined;
  }

  const fromIso = toBoundaryIso(from, 'start');
  const toIso = toBoundaryIso(to, 'end');

  if (!fromIso || !toIso) {
    return undefined;
  }

  if (new Date(fromIso).getTime() > new Date(toIso).getTime()) {
    return 'Khoảng thời gian không hợp lệ: ngày bắt đầu phải trước ngày kết thúc.';
  }

  return undefined;
}

function formatTimestamp(value?: string | null) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return dateFormatter.format(date);
}

function formatNumber(value: number) {
  return value.toLocaleString('vi-VN');
}

function formatMode(mode: ApiIntegrationSyncRun['mode']): string {
  switch (mode) {
    case 'AUTO':
      return 'Tự động';
    case 'MANUAL':
      return 'Thủ công';
    case 'REFRESH_ON_OPEN':
      return 'Mở lại';
    default:
      return mode;
  }
}
