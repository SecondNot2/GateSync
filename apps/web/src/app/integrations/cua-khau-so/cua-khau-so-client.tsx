'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { NoOrganizationState } from '@/components/no-organization-state';
import type {
  ApiCuaKhauSoDeclarationDetail,
  ApiCuaKhauSoDeclarationSummary,
  ApiCuaKhauSoDirection,
  ApiCuaKhauSoPageSize,
  ApiCuaKhauSoStatus,
  ApiCuaKhauSoSyncResult,
  ListCuaKhauSoDeclarationsParams
} from '@/lib/api/types';
import {
  connectCuaKhauSo,
  getCuaKhauSoDeclaration,
  loadCuaKhauSoData,
  syncCuaKhauSoDeclaration
} from '@/lib/operations/data';
import { isOrganizationAccessError, type OrganizationAccessIssue } from '@/lib/operations/errors';
import type { CuaKhauSoViewData } from '@/lib/operations/view-model';
import { formatApiDateTime } from '@/lib/operations/view-model';
import { tripEventTypeLabels } from '@/lib/ui-labels';

const pageSizes: ApiCuaKhauSoPageSize[] = [10, 20, 50, 100];
const statuses: Array<{ value: ''; label: string } | { value: ApiCuaKhauSoStatus; label: string }> =
  [
    { value: '', label: 'Tất cả trạng thái' },
    { value: 1, label: 'Chưa hoàn thành' },
    { value: 2, label: 'Hoàn thành' },
    { value: 3, label: 'Đã hủy' }
  ];
const directions: Array<
  { value: ''; label: string } | { value: ApiCuaKhauSoDirection; label: string }
> = [
  { value: '', label: 'Nhập + Xuất' },
  { value: 'IMPORT', label: 'Nhập khẩu' },
  { value: 'EXPORT', label: 'Xuất khẩu' }
];

export function CuaKhauSoClient() {
  const [data, setData] = useState<CuaKhauSoViewData>();
  const [detail, setDetail] = useState<ApiCuaKhauSoDeclarationDetail>();
  const [syncResult, setSyncResult] = useState<ApiCuaKhauSoSyncResult>();
  const [error, setError] = useState<string>();
  const [organizationIssue, setOrganizationIssue] = useState<OrganizationAccessIssue>();
  const [message, setMessage] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<string>('');
  const [direction, setDirection] = useState<string>('');
  const [pageSize, setPageSize] = useState<ApiCuaKhauSoPageSize>(20);
  const [selectedExternalId, setSelectedExternalId] = useState<string>();
  const filters = useMemo<ListCuaKhauSoDeclarationsParams>(() => {
    const nextFilters: ListCuaKhauSoDeclarationsParams = {
      pageNumber: 1,
      pageSize
    };

    if (keyword.trim()) {
      nextFilters.keyword = keyword.trim();
    }

    const parsedStatus = parseCuaKhauSoStatus(status);

    if (parsedStatus) {
      nextFilters.status = parsedStatus;
    }

    if (isCuaKhauSoDirection(direction)) {
      nextFilters.direction = direction;
    }

    return nextFilters;
  }, [direction, keyword, pageSize, status]);
  const shellProps = data?.organization ? { organization: data.organization } : {};

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setIsLoading(true);
      setError(undefined);
      setOrganizationIssue(undefined);

      try {
        const result = await loadCuaKhauSoData(filters);

        if (isMounted) {
          setData(result);
        }
      } catch (loadError) {
        if (isMounted) {
          if (isOrganizationAccessError(loadError)) {
            setOrganizationIssue(loadError.issue);
          }

          setError(
            loadError instanceof Error ? loadError.message : 'Không thể tải dữ liệu Cửa khẩu số.'
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [filters]);

  async function reload() {
    const result = await loadCuaKhauSoData(filters);
    setData(result);
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsConnecting(true);
    setMessage(undefined);
    setError(undefined);

    try {
      await connectCuaKhauSo({
        username: username.trim(),
        password
      });
      setPassword('');
      setMessage(
        'Đã kết nối phiên đọc Cửa khẩu số. Token nguồn được giữ ở backend và không hiển thị trên trình duyệt.'
      );
      await reload();
    } catch (connectError) {
      setError(
        connectError instanceof Error ? connectError.message : 'Không thể đăng nhập Cửa khẩu số.'
      );
    } finally {
      setIsConnecting(false);
    }
  }

  async function openDetail(declaration: ApiCuaKhauSoDeclarationSummary) {
    setSelectedExternalId(declaration.externalId);
    setIsDetailLoading(true);
    setError(undefined);
    setSyncResult(undefined);

    try {
      const result = await getCuaKhauSoDeclaration(declaration.externalId);
      setDetail(result);
    } catch (detailError) {
      setError(
        detailError instanceof Error ? detailError.message : 'Không thể tải chi tiết tờ khai.'
      );
    } finally {
      setIsDetailLoading(false);
    }
  }

  async function syncSelectedDeclaration() {
    if (!detail) {
      return;
    }

    setIsSyncing(true);
    setMessage(undefined);
    setError(undefined);

    try {
      const result = await syncCuaKhauSoDeclaration(detail.externalId);
      setSyncResult(result);
      setMessage('Đã đồng bộ tờ khai vào GateSync. Không có thao tác ghi lên Cửa khẩu số.');
      await reload();
    } catch (syncError) {
      setError(
        syncError instanceof Error ? syncError.message : 'Không thể đồng bộ tờ khai vào GateSync.'
      );
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <AppShell
      activeNav="integrations"
      eyebrow="Tích hợp dữ liệu"
      title="Cửa khẩu số Lạng Sơn"
      description="Xem dữ liệu tờ khai vận tải ở chế độ chỉ đọc, sau đó đồng bộ có kiểm soát vào timeline GateSync khi cần."
      {...shellProps}
      action={
        <button
          type="button"
          onClick={() => void reload()}
          className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
        >
          Tải lại dữ liệu
        </button>
      }
    >
      {data?.notice ? <NoticePanel message={data.notice} tone="warning" /> : null}
      {message ? <NoticePanel message={message} tone="info" /> : null}
      {error && !organizationIssue ? <NoticePanel message={error} tone="error" /> : null}
      {!isLoading && organizationIssue && error ? (
        <NoOrganizationState issue={organizationIssue} message={error} />
      ) : null}

      {!organizationIssue ? (
        <>
          <section className="grid gap-5 xl:grid-cols-[1fr_24rem]">
            <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                    Kết nối nguồn
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-slate-950">Phiên đọc Cửa khẩu số</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                    GateSync chỉ gọi các endpoint đọc danh sách, chi tiết và bước thủ tục. Không có
                    thao tác thêm, sửa hoặc xóa dữ liệu trên hệ thống nguồn.
                  </p>
                </div>
                <ReadOnlyBadge />
              </div>

              <form
                onSubmit={submitLogin}
                className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end"
              >
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Tài khoản Cửa khẩu số
                  </span>
                  <input
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder="Tên đăng nhập được ủy quyền đọc"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Mật khẩu
                  </span>
                  <input
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder="Không lưu ở trình duyệt"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <button
                  className="min-h-12 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  disabled={isConnecting || !username.trim() || !password}
                >
                  {isConnecting ? 'Đang kết nối...' : 'Kết nối chỉ đọc'}
                </button>
              </form>
            </div>

            <div className="rounded-[1.75rem] border border-emerald-100 bg-emerald-50 p-4 shadow-soft sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Trạng thái an toàn
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-950">
                {data?.session.authenticated ? 'Đã có phiên đọc' : 'Chưa kết nối'}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {data?.session.authenticated
                  ? `Tài khoản: ${data.session.username ?? 'không hiển thị'} · Hết hạn: ${formatApiDateTime(data.session.expiresAt)}`
                  : 'Đăng nhập để backend giữ phiên nguồn. Browser không nhận token Cửa khẩu số.'}
              </p>
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                  Tờ khai vận tải
                </p>
                <h2 className="mt-2 text-2xl font-bold text-slate-950">
                  {isLoading
                    ? 'Đang tải dữ liệu...'
                    : `${data?.declarations.totalCount ?? 0} tờ khai tìm thấy`}
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  {data?.declarations.message ?? 'Dữ liệu chỉ được đọc từ Cửa khẩu số.'}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-4 xl:w-[42rem]">
                <input
                  className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 sm:col-span-2"
                  placeholder="Tìm biển số, số mooc, số tờ khai"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
                <select
                  className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  {statuses.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <select
                  className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  value={direction}
                  onChange={(event) => setDirection(event.target.value)}
                >
                  {directions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <select
                  className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 sm:col-start-4"
                  value={pageSize}
                  onChange={(event) =>
                    setPageSize(Number(event.target.value) as ApiCuaKhauSoPageSize)
                  }
                >
                  {pageSizes.map((size) => (
                    <option key={size} value={size}>
                      {size} dòng
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isLoading ? <StatePanel message="Đang tải tờ khai từ API GateSync..." /> : null}
            {!isLoading && !data?.session.authenticated ? (
              <StatePanel message="Hãy kết nối phiên Cửa khẩu số chỉ đọc trước khi tải dữ liệu thật." />
            ) : null}
            {!isLoading &&
            data?.session.authenticated &&
            data.declarations.declarations.length === 0 ? (
              <StatePanel message="Không tìm thấy tờ khai phù hợp với bộ lọc hiện tại." />
            ) : null}
            {!isLoading && data && data.declarations.declarations.length > 0 ? (
              <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_26rem]">
                <DeclarationList
                  declarations={data.declarations.declarations}
                  selectedExternalId={selectedExternalId}
                  onSelect={openDetail}
                />
                <DeclarationDetailPanel
                  detail={detail}
                  isLoading={isDetailLoading}
                  isSyncing={isSyncing}
                  syncResult={syncResult}
                  onSync={() => void syncSelectedDeclaration()}
                />
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </AppShell>
  );
}

function DeclarationList({
  declarations,
  selectedExternalId,
  onSelect
}: {
  declarations: ApiCuaKhauSoDeclarationSummary[];
  selectedExternalId: string | undefined;
  onSelect: (declaration: ApiCuaKhauSoDeclarationSummary) => void;
}) {
  return (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-3xl border border-slate-100 bg-white">
      {declarations.map((declaration) => {
        const isSelected = declaration.externalId === selectedExternalId;

        return (
          <button
            key={declaration.externalId}
            type="button"
            onClick={() => onSelect(declaration)}
            className={`grid w-full gap-4 px-5 py-5 text-left transition xl:grid-cols-[1fr_0.7fr_0.8fr_auto] xl:items-center ${
              isSelected ? 'bg-sky-50' : 'hover:bg-slate-50'
            }`}
          >
            <div>
              <p className="font-semibold text-slate-950">{declaration.declarationNumber}</p>
              <p className="mt-1 text-sm text-slate-600">
                {declaration.companyGoodsName} · {formatApiDateTime(declaration.createdAt)}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{declaration.plateNumber}</p>
              <p className="mt-1 text-xs text-slate-500">Mooc: {declaration.trailerNumber}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {declaration.direction === 'IMPORT' ? 'Nhập khẩu' : 'Xuất khẩu'} ·{' '}
                {declaration.gateName}
              </p>
              <p className="mt-1 text-xs text-slate-500">{declaration.paymentStatus}</p>
            </div>
            <span
              className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                declaration.completed
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {declaration.statusLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DeclarationDetailPanel({
  detail,
  isLoading,
  isSyncing,
  syncResult,
  onSync
}: {
  detail: ApiCuaKhauSoDeclarationDetail | undefined;
  isLoading: boolean;
  isSyncing: boolean;
  syncResult: ApiCuaKhauSoSyncResult | undefined;
  onSync: () => void;
}) {
  if (isLoading) {
    return <StatePanel message="Đang tải chi tiết tờ khai..." />;
  }

  if (!detail) {
    return <StatePanel message="Chọn một tờ khai để xem chi tiết và các bước thủ tục." />;
  }

  return (
    <aside className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Chi tiết tờ khai
          </p>
          <h3 className="mt-2 text-xl font-bold text-slate-950">{detail.declarationNumber}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {detail.gateName} · {detail.parkingPlace.name}
          </p>
        </div>
        <ReadOnlyBadge />
      </div>

      <div className="mt-5 grid gap-3 text-sm">
        <InfoRow label="Doanh nghiệp nộp phí" value={detail.feePayingCompany.name} />
        <InfoRow label="Mã số thuế" value={detail.feePayingCompany.taxCode} />
        <InfoRow label="Ngày đến" value={formatApiDateTime(detail.arrivalAt)} />
        <InfoRow label="Phí hạ tầng" value={formatMoney(detail.infrastructureCharges)} />
        <InfoRow label="Phí sang tải" value={formatMoney(detail.transferCharges)} />
      </div>

      <div className="mt-5">
        <p className="text-sm font-bold text-slate-950">6 bước thủ tục</p>
        <div className="mt-3 space-y-2">
          {detail.procedureSteps.map((step) => (
            <div
              key={step.step}
              className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {step.step}. {step.label}
                </p>
                <p className="mt-1 text-xs text-slate-500">{formatApiDateTime(step.occurredAt)}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  step.done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {step.done ? 'Đã xong' : 'Chưa có dữ liệu'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <p className="text-sm font-bold text-slate-950">Sự kiện có thể đồng bộ</p>
        <div className="mt-3 space-y-2">
          {detail.eventCandidates.length > 0 ? (
            detail.eventCandidates.map((event) => (
              <div key={event.idempotencyKey} className="rounded-2xl bg-white px-4 py-3 text-sm">
                <p className="font-semibold text-slate-900">
                  {tripEventTypeLabels[event.eventType]}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatApiDateTime(event.occurredAt)} · độ tin cậy{' '}
                  {Math.round(event.confidence * 100)}%
                </p>
              </div>
            ))
          ) : (
            <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-600">
              Chưa có sự kiện đủ timestamp tin cậy để đồng bộ timeline.
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onSync}
        disabled={isSyncing}
        className="mt-5 min-h-12 w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ vào GateSync'}
      </button>
      <p className="mt-3 text-xs leading-5 text-slate-500">
        Nút này chỉ ghi vào cơ sở dữ liệu GateSync. GateSync không gửi thao tác sửa/xóa lên Cửa khẩu
        số.
      </p>

      {syncResult ? (
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-semibold">Đồng bộ lúc {formatApiDateTime(syncResult.lastSyncAt)}</p>
          <p className="mt-1">
            Ghi nhận {syncResult.recordedEvents.length} sự kiện, bỏ qua{' '}
            {syncResult.skippedEvents.length} sự kiện.
          </p>
          <p className="mt-1">
            Liên kết chuyến: {syncResult.linkedTripId ?? 'chưa tự động liên kết'}.
          </p>
        </div>
      ) : null}
    </aside>
  );
}

function ReadOnlyBadge() {
  return (
    <span className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
      Chỉ đọc nguồn
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl bg-white px-4 py-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function NoticePanel({
  message,
  tone = 'info'
}: {
  message: string;
  tone?: 'info' | 'warning' | 'error';
}) {
  const toneClass = {
    info: 'border-sky-100 bg-sky-50 text-sky-800',
    warning: 'border-amber-100 bg-amber-50 text-amber-800',
    error: 'border-rose-100 bg-rose-50 text-rose-800'
  }[tone];

  return (
    <div className={`rounded-3xl border px-5 py-4 text-sm font-semibold ${toneClass}`}>
      {message}
    </div>
  );
}

function StatePanel({ message }: { message: string }) {
  return (
    <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm font-medium text-slate-600">
      {message}
    </div>
  );
}

function parseCuaKhauSoStatus(value: string): ApiCuaKhauSoStatus | undefined {
  if (value === '1' || value === '2' || value === '3') {
    return Number(value) as ApiCuaKhauSoStatus;
  }

  return undefined;
}

function isCuaKhauSoDirection(value: string): value is ApiCuaKhauSoDirection {
  return value === 'IMPORT' || value === 'EXPORT';
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0
  }).format(value);
}
