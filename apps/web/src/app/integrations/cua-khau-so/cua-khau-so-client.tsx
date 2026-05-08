'use client';

import { hasOrganizationPermission, membershipRoles } from '@gatesync/shared';
import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { NoOrganizationState } from '@/components/no-organization-state';
import { Button, DateInput, SearchInput, SelectInput, TextInput } from '@/components/ui';
import type {
  ApiCuaKhauSoDeclarationDetail,
  ApiCuaKhauSoDeclarationSummary,
  ApiCuaKhauSoDirection,
  ApiCuaKhauSoHealth,
  ApiCuaKhauSoPageSize,
  ApiCuaKhauSoStatus,
  ApiCuaKhauSoSyncResult,
  ApiIntegrationSyncRun,
  ListCuaKhauSoDeclarationsParams
} from '@/lib/api/types';
import {
  connectCuaKhauSo,
  getCuaKhauSoDeclaration,
  loadCuaKhauSoData,
  runCuaKhauSoSyncNow,
  syncCuaKhauSoDeclaration
} from '@/lib/operations/data';
import { isOrganizationAccessError, type OrganizationAccessIssue } from '@/lib/operations/errors';
import type { CuaKhauSoViewData } from '@/lib/operations/view-model';
import { formatApiDateTime } from '@/lib/operations/view-model';
import { membershipRoleLabels, tripEventTypeLabels } from '@/lib/ui-labels';

const pageSizes: ApiCuaKhauSoPageSize[] = [10, 20, 50, 100];
const statuses: Array<{ value: ''; label: string } | { value: ApiCuaKhauSoStatus; label: string }> =
  [
    { value: '', label: 'Tất cả trạng thái' },
    { value: 1, label: 'Chưa hoàn thành nghiệp vụ' },
    { value: 2, label: 'Hoàn thành nghiệp vụ' },
    { value: 3, label: 'Đã hủy' }
  ];
const directions: Array<
  { value: ''; label: string } | { value: ApiCuaKhauSoDirection; label: string }
> = [
  { value: '', label: 'Nhập + Xuất' },
  { value: 'IMPORT', label: 'Nhập khẩu' },
  { value: 'EXPORT', label: 'Xuất khẩu' }
];
const cuaKhauSoConnectorRoleLabels = membershipRoles
  .filter((role) => hasOrganizationPermission(role, 'integrations:cua-khau-so:connect'))
  .map((role) => membershipRoleLabels[role])
  .join(', ');
const cuaKhauSoSyncRoleLabels = membershipRoles
  .filter((role) => hasOrganizationPermission(role, 'integrations:cua-khau-so:sync'))
  .map((role) => membershipRoleLabels[role])
  .join(', ');
const cuaKhauSoLinkedByLabels: Record<ApiCuaKhauSoSyncResult['linkedBy'], string> = {
  requested: 'theo chuyến được chọn',
  declaration: 'theo tờ khai đã đồng bộ trước đó',
  tripCode: 'theo mã chuyến trùng số tờ khai',
  created: 'đã tạo chuyến mới từ tờ khai',
  none: 'chưa liên kết chuyến'
};

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
  const [isRunningSyncNow, setIsRunningSyncNow] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<string>('1');
  const [direction, setDirection] = useState<string>('');
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState<ApiCuaKhauSoPageSize>(20);
  const [fromDate, setFromDate] = useState(getDefaultFromDateValue);
  const [toDate, setToDate] = useState(getTodayDateValue);
  const [selectedExternalId, setSelectedExternalId] = useState<string>();
  const currentUser = data?.organization.currentUser;
  const canConnectIntegration = currentUser?.canConnectCuaKhauSoIntegration ?? false;
  const canSyncIntegration = currentUser?.canSyncCuaKhauSoIntegration ?? false;
  const filters = useMemo<ListCuaKhauSoDeclarationsParams>(() => {
    const nextFilters: ListCuaKhauSoDeclarationsParams = {
      pageNumber,
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

    if (fromDate) {
      nextFilters.from = toStartOfDayIso(fromDate);
    }

    if (toDate) {
      nextFilters.to = toEndOfDayIso(toDate);
    }

    return nextFilters;
  }, [direction, fromDate, keyword, pageNumber, pageSize, status, toDate]);
  const shellProps = data?.organization ? { organization: data.organization } : {};
  const totalPage = data?.declarations.totalPage ?? 0;

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

  useEffect(() => {
    setPageNumber(1);
    setSelectedExternalId(undefined);
    setDetail(undefined);
    setSyncResult(undefined);
  }, [direction, fromDate, keyword, pageSize, status, toDate]);

  useEffect(() => {
    if (totalPage > 0 && pageNumber > totalPage) {
      setPageNumber(totalPage);
    }
  }, [pageNumber, totalPage]);

  async function reload() {
    const result = await loadCuaKhauSoData(filters);
    setData(result);
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canConnectIntegration) {
      setError('Vai trò hiện tại không có quyền kết nối phiên Cửa khẩu số.');
      return;
    }

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

    if (!canSyncIntegration) {
      setError('Vai trò hiện tại không có quyền đồng bộ tờ khai vào GateSync.');
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

  async function runManualAutoSync() {
    if (!canSyncIntegration) {
      setError('Vai trò hiện tại không có quyền chạy đồng bộ tự động.');
      return;
    }

    setIsRunningSyncNow(true);
    setMessage(undefined);
    setError(undefined);

    try {
      const result = await runCuaKhauSoSyncNow();
      setMessage(
        result.skipped
          ? 'Một worker khác đang đối chiếu Cửa khẩu số. GateSync sẽ dùng kết quả mới nhất khi hoàn tất.'
          : `Đã chạy đối chiếu tổ chức: ${result.detailsFetched} chi tiết, ${result.eventsCreated} sự kiện mới, ${result.eventsSkipped} sự kiện bỏ qua.`
      );
      await reload();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Không thể chạy đồng bộ tự động.');
    } finally {
      setIsRunningSyncNow(false);
    }
  }

  return (
    <AppShell
      activeNav="settings"
      eyebrow="Cài đặt cấu hình"
      title="Cấu hình Cửa khẩu số"
      description="Quản trị kết nối chỉ đọc, độ mới bản sao nội bộ và các lần đối chiếu từ Cửa khẩu số vào GateSync."
      {...shellProps}
      action={
        <button
          type="button"
          onClick={() => void reload()}
          className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
        >
          Làm mới màn hình
        </button>
      }
    >
      {data?.notice ? <NoticePanel message={data.notice} tone="warning" /> : null}
      {message ? <NoticePanel message={message} tone="info" /> : null}
      {error && !organizationIssue ? <NoticePanel message={error} tone="error" /> : null}
      {data?.health ? <HealthSummaryPanel health={data.health} /> : null}
      {!isLoading && organizationIssue && error ? (
        <NoOrganizationState issue={organizationIssue} message={error} />
      ) : null}

      {!organizationIssue ? (
        <>
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
                  {data?.declarations.message ?? 'Dữ liệu được đọc từ bản sao nội bộ GateSync.'}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:w-[54rem] xl:grid-cols-6">
                <SearchInput
                  label="Tìm tờ khai"
                  wrapperClassName="sm:col-span-2"
                  placeholder="Biển số, số mooc, số tờ khai"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
                <SelectInput
                  label="Trạng thái"
                  value={status}
                  options={statuses.map((item) => ({
                    value: String(item.value),
                    label: item.label
                  }))}
                  onChange={(event) => setStatus(event.target.value)}
                />
                <SelectInput
                  label="Luồng"
                  value={direction}
                  options={directions.map((item) => ({
                    value: item.value,
                    label: item.label
                  }))}
                  onChange={(event) => setDirection(event.target.value)}
                />
                <DateInput
                  label="Từ ngày"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                />
                <DateInput
                  label="Đến ngày"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                />
                <SelectInput
                  label="Số dòng"
                  value={pageSize}
                  options={pageSizes.map((size) => ({
                    value: String(size),
                    label: `${size} dòng`
                  }))}
                  onChange={(event) =>
                    setPageSize(Number(event.target.value) as ApiCuaKhauSoPageSize)
                  }
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <p>
                Mặc định hiển thị tờ khai chưa hoàn thành nghiệp vụ trong 7 ngày gần nhất. Tờ khai
                đã thanh toán Thuế được xem là hoàn thành nghiệp vụ. Màn hình này không gọi ghi lên
                Cửa khẩu số.
              </p>
              <Button
                type="button"
                variant="soft"
                onClick={() => {
                  setStatus('1');
                  setFromDate(getDefaultFromDateValue());
                  setToDate(getTodayDateValue());
                  setKeyword('');
                  setDirection('');
                }}
              >
                Về bộ lọc mặc định
              </Button>
            </div>

            {isLoading ? <StatePanel message="Đang tải tờ khai từ API GateSync..." /> : null}
            {!isLoading && data && !data.health.configured && data.declarations.totalCount === 0 ? (
              <StatePanel message="Chưa cấu hình tài khoản nguồn. Sau khi kết nối, worker backend sẽ tạo bản sao nội bộ để theo dõi." />
            ) : null}
            {!isLoading &&
            data?.health.configured &&
            data.declarations.declarations.length === 0 ? (
              <StatePanel message="Không tìm thấy tờ khai phù hợp với bộ lọc hiện tại." />
            ) : null}
            {!isLoading && data && data.declarations.declarations.length > 0 ? (
              <>
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
                    canSync={canSyncIntegration}
                    syncResult={syncResult}
                    onSync={() => void syncSelectedDeclaration()}
                  />
                </div>
                <PaginationControls
                  pageNumber={pageNumber}
                  totalPage={totalPage}
                  totalCount={data.declarations.totalCount}
                  onPrevious={() => setPageNumber((current) => Math.max(1, current - 1))}
                  onNext={() => setPageNumber((current) => current + 1)}
                />
              </>
            ) : null}
          </section>

          <section className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Tự động đồng bộ
                </p>
                <h2 className="mt-2 text-2xl font-bold text-slate-950">
                  Cập nhật tờ khai đang xử lý
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  Worker backend chạy theo lịch thưa để tự đọc các tờ khai chưa hoàn thành trong 7
                  ngày gần nhất, cập nhật bản sao nội bộ, tạo sự kiện timeline idempotent và tự liên
                  kết xe/tài xế khi khớp hồ sơ nội bộ. Không có thao tác ghi ngược lên hệ thống
                  nguồn.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={!canSyncIntegration || isRunningSyncNow || !data?.health.configured}
                onClick={() => void runManualAutoSync()}
              >
                {canSyncIntegration
                  ? isRunningSyncNow
                    ? 'Đang đối chiếu...'
                    : 'Đối chiếu ngay'
                  : 'Không có quyền đồng bộ'}
              </Button>
            </div>
            <SyncRunList syncRuns={data?.syncRuns ?? []} />
          </section>

          <section className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-3 shadow-soft sm:p-4">
            <details>
              <summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                    Kết nối nguồn
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">Phiên đọc Cửa khẩu số</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ReadOnlyBadge />
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                    {data?.session.authenticated ? 'Đã có phiên đọc' : 'Chưa kết nối'}
                  </span>
                </div>
              </summary>

              <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_22rem]">
                <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm leading-6 text-slate-600">
                    GateSync chỉ gọi các endpoint đọc danh sách, chi tiết và bước thủ tục. Không có
                    thao tác thêm, sửa hoặc xóa dữ liệu trên hệ thống nguồn.
                  </p>
                  <div className="mt-3 rounded-3xl border border-sky-100 bg-white px-4 py-3 text-sm leading-6 text-sky-900">
                    <p>
                      Tổ chức:{' '}
                      <span className="font-bold">
                        {data?.organization.name ?? 'đang xác định'}
                      </span>
                    </p>
                    <p className="mt-1">
                      Vai trò hiện tại:{' '}
                      <span className="font-bold">
                        {currentUser ? membershipRoleLabels[currentUser.role] : 'đang kiểm tra'}
                      </span>
                      . Kết nối: {cuaKhauSoConnectorRoleLabels}. Đồng bộ: {cuaKhauSoSyncRoleLabels}.
                    </p>
                  </div>

                  <form
                    onSubmit={submitLogin}
                    className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end"
                  >
                    <TextInput
                      label="Tài khoản Cửa khẩu số"
                      placeholder="Tên đăng nhập được ủy quyền đọc"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                    />
                    <TextInput
                      label="Mật khẩu"
                      placeholder="Không lưu ở trình duyệt"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <Button
                      disabled={
                        isLoading ||
                        isConnecting ||
                        !username.trim() ||
                        !password ||
                        !canConnectIntegration
                      }
                    >
                      {isLoading
                        ? 'Đang kiểm tra quyền...'
                        : canConnectIntegration
                          ? isConnecting
                            ? 'Đang kết nối...'
                            : 'Kết nối chỉ đọc'
                          : 'Không có quyền kết nối'}
                    </Button>
                  </form>
                  {!isLoading && !canConnectIntegration ? (
                    <p className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      Chỉ các vai trò được phân quyền tích hợp mới có thể tạo phiên đọc Cửa khẩu số.
                    </p>
                  ) : null}
                </div>

                <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    Trạng thái an toàn
                  </p>
                  <p className="mt-2 text-2xl font-bold text-slate-950">
                    {data?.session.authenticated ? 'Đã có phiên đọc' : 'Chưa kết nối'}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {data?.session.authenticated
                      ? `Tài khoản: ${data.session.username ?? 'không hiển thị'} · Hết hạn: ${formatApiDateTime(data.session.expiresAt)}`
                      : 'Đăng nhập để backend giữ phiên nguồn. Browser không nhận token hoặc raw payload nguồn.'}
                  </p>
                  <p className="mt-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm leading-6 text-emerald-800">
                    Credential nguồn chỉ gửi qua API GateSync sau auth + RBAC. Token phiên Cửa khẩu
                    số được giữ ở backend và không được trả về frontend.
                  </p>
                </div>
              </div>
            </details>
          </section>
        </>
      ) : null}
    </AppShell>
  );
}

function HealthSummaryPanel({ health }: { health: ApiCuaKhauSoHealth }) {
  return (
    <section className="grid gap-3 lg:grid-cols-4">
      <div
        className={`rounded-3xl border px-5 py-4 ${
          health.stale ? 'border-amber-100 bg-amber-50' : 'border-emerald-100 bg-emerald-50'
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
          Độ mới dữ liệu
        </p>
        <p className="mt-2 text-xl font-bold text-slate-950">{health.freshnessLabel}</p>
        <p className="mt-1 text-sm text-slate-600">
          {health.configured ? 'Bản sao nội bộ đang được theo dõi.' : 'Chưa cấu hình nguồn.'}
        </p>
      </div>
      <MetricCard
        label="Lần đối chiếu thành công"
        value={formatApiDateTime(health.lastSuccessfulSyncAt)}
      />
      <MetricCard label="Lần quét danh sách" value={formatApiDateTime(health.lastSyncAt)} />
      <MetricCard
        label={health.status === 'ERROR' ? 'Lỗi gần nhất' : 'Trạng thái worker'}
        value={
          health.status === 'ERROR'
            ? health.lastErrorMessage || 'Cần kiểm tra kết nối'
            : health.status
        }
      />
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white/95 px-5 py-4 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-base font-bold text-slate-950">{value}</p>
    </div>
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
      {declarations.map((declaration, index) => {
        const isSelected = declaration.externalId === selectedExternalId;

        return (
          <button
            key={`${declaration.externalId}-${index}`}
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
              <p className="mt-1 text-xs text-slate-500">
                GateSync thấy lúc {formatApiDateTime(declaration.sourceObservedAt)}
                {declaration.linkedTripCode ? ` · chuyến ${declaration.linkedTripCode}` : ''}
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

function PaginationControls({
  pageNumber,
  totalPage,
  totalCount,
  onPrevious,
  onNext
}: {
  pageNumber: number;
  totalPage: number;
  totalCount: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-100 bg-white px-4 py-3 text-sm text-slate-600">
      <p>
        Trang <span className="font-bold text-slate-950">{pageNumber}</span> /{' '}
        <span className="font-bold text-slate-950">{Math.max(totalPage, 1)}</span> · {totalCount} tờ
        khai sau lọc.
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" disabled={pageNumber <= 1} onClick={onPrevious}>
          Trang trước
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={totalPage === 0 || pageNumber >= totalPage}
          onClick={onNext}
        >
          Trang sau
        </Button>
      </div>
    </div>
  );
}

function SyncRunList({ syncRuns }: { syncRuns: ApiIntegrationSyncRun[] }) {
  if (syncRuns.length === 0) {
    return (
      <p className="mt-4 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-5 text-sm text-slate-600">
        Chưa có lịch sử chạy đồng bộ. Khi worker hoặc nút “Chạy lại khi cần” hoạt động, các lần chạy
        sẽ hiển thị tại đây.
      </p>
    );
  }

  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      {syncRuns.slice(0, 6).map((run) => (
        <div key={run.id} className="rounded-3xl border border-slate-100 bg-slate-50 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-slate-950">
              {getSyncRunModeLabel(run.mode)}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                run.status === 'SUCCEEDED'
                  ? 'bg-emerald-100 text-emerald-700'
                  : run.status === 'FAILED'
                    ? 'bg-rose-100 text-rose-700'
                    : run.status === 'PARTIAL'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-sky-100 text-sky-700'
              }`}
            >
              {run.status}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Bắt đầu {formatApiDateTime(run.startedAt)}
            {run.finishedAt ? ` · xong ${formatApiDateTime(run.finishedAt)}` : ''}
          </p>
          <p className="mt-2 text-sm text-slate-700">
            {run.detailsFetched} chi tiết · {run.eventsCreated} sự kiện mới · {run.eventsSkipped} bỏ
            qua
          </p>
          {run.errorMessage ? (
            <p className="mt-2 text-xs font-semibold text-rose-700">{run.errorMessage}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function getSyncRunModeLabel(mode: ApiIntegrationSyncRun['mode']) {
  if (mode === 'REFRESH_ON_OPEN') {
    return 'Mở màn hình';
  }

  if (mode === 'MANUAL') {
    return 'Đối chiếu ngay';
  }

  return 'Tự động';
}

function DeclarationDetailPanel({
  detail,
  isLoading,
  isSyncing,
  canSync,
  syncResult,
  onSync
}: {
  detail: ApiCuaKhauSoDeclarationDetail | undefined;
  isLoading: boolean;
  isSyncing: boolean;
  canSync: boolean;
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
                {step.description ? (
                  <p className="mt-1 text-xs leading-5 text-slate-500">{step.description}</p>
                ) : null}
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  step.done
                    ? 'bg-emerald-100 text-emerald-700'
                    : step.status === 'WAITING_AUTHORITY'
                      ? 'bg-sky-100 text-sky-700'
                      : 'bg-slate-100 text-slate-600'
                }`}
              >
                {step.done
                  ? 'Đã xong'
                  : step.status === 'WAITING_AUTHORITY'
                    ? 'Chờ xác nhận'
                    : 'Chưa có dữ liệu'}
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
        disabled={isSyncing || !canSync}
        className="mt-5 min-h-12 w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {canSync
          ? isSyncing
            ? 'Đang đồng bộ...'
            : 'Đồng bộ vào GateSync'
          : 'Không có quyền đồng bộ'}
      </button>
      <p className="mt-3 text-xs leading-5 text-slate-500">
        Nút này chỉ ghi vào cơ sở dữ liệu GateSync. GateSync không gửi thao tác sửa/xóa lên Cửa khẩu
        số. Nếu bị khóa, vai trò hiện tại chỉ được xem dữ liệu tích hợp.
      </p>

      {syncResult ? (
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-semibold">Đồng bộ lúc {formatApiDateTime(syncResult.lastSyncAt)}</p>
          <p className="mt-1">
            Ghi nhận {syncResult.recordedEvents.length} sự kiện, bỏ qua{' '}
            {syncResult.skippedEvents.length} sự kiện.
          </p>
          <p className="mt-1">
            Liên kết chuyến: {cuaKhauSoLinkedByLabels[syncResult.linkedBy]}
            {syncResult.linkedTripId ? ` (${syncResult.linkedTripId})` : ''}.
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

function getDefaultFromDateValue() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return toDateInputValue(date);
}

function getTodayDateValue() {
  return toDateInputValue(new Date());
}

function toStartOfDayIso(value: string) {
  return new Date(`${value}T00:00:00.000`).toISOString();
}

function toEndOfDayIso(value: string) {
  return new Date(`${value}T23:59:59.999`).toISOString();
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0
  }).format(value);
}
