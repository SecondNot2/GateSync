'use client';

import { tripExceptionFilters, tripStatuses } from '@gatesync/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { AppShell } from '@/components/app-shell';
import { NoOrganizationState } from '@/components/no-organization-state';
import { PriorityBadge, TripStatusBadge } from '@/components/status-badge';
import {
  Button,
  DateInput,
  SearchInput,
  SelectInput,
  StatePanel,
  TextInput
} from '@/components/ui';
import type { ListTripsParams } from '@/lib/api/types';
import { loadTripsData, runCuaKhauSoSyncNow } from '@/lib/operations/data';
import { isOrganizationAccessError, type OrganizationAccessIssue } from '@/lib/operations/errors';
import {
  countActiveTripFilters,
  hasAdvancedTripFilters,
  isTripExceptionFilter,
  isTripStatus,
  toTripFilters
} from '@/lib/operations/trip-filters';
import type { TripsViewData } from '@/lib/operations/view-model';
import {
  formatDelay,
  tripExceptionFilterLabels,
  tripStatusLabels,
  tripTypeLabels
} from '@/lib/ui-labels';

type TripsClientProps = {
  initialData?: TripsViewData;
  initialError?: string;
  initialOrganizationIssue?: OrganizationAccessIssue;
  initialSearchKey?: string;
};

export function TripsClient({
  initialData,
  initialError,
  initialOrganizationIssue,
  initialSearchKey
}: TripsClientProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const filters = useMemo(() => toTripFilters(searchParams), [searchParams]);
  const hasInitialState = Boolean(initialData || initialError || initialOrganizationIssue);
  const [data, setData] = useState<TripsViewData | undefined>(initialData);
  const [error, setError] = useState<string | undefined>(initialError);
  const [organizationIssue, setOrganizationIssue] = useState<OrganizationAccessIssue | undefined>(
    initialOrganizationIssue
  );
  const [isLoading, setIsLoading] = useState(!hasInitialState);
  const [loadedSearchKey, setLoadedSearchKey] = useState<string | undefined>(
    hasInitialState ? (initialSearchKey ?? '') : undefined
  );
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(filters.search ?? '');
  const [status, setStatus] = useState(filters.status ?? '');
  const [borderGateId, setBorderGateId] = useState(filters.borderGateId ?? '');
  const [yardId, setYardId] = useState(filters.yardId ?? '');
  const [driverProfileId, setDriverProfileId] = useState(filters.driverProfileId ?? '');
  const [vehicleId, setVehicleId] = useState(filters.vehicleId ?? '');
  const [cargoOwnerOrganizationId, setCargoOwnerOrganizationId] = useState(
    filters.cargoOwnerOrganizationId ?? ''
  );
  const [exception, setException] = useState(filters.exception ?? '');
  const [from, setFrom] = useState(toDateInputValue(filters.from));
  const [to, setTo] = useState(toDateInputValue(filters.to));
  const shellProps = data?.organization ? { organization: data.organization } : {};
  const priorityTrip = data?.trips.find(
    (trip) => trip.priority !== 'NORMAL' || trip.delayMinutes > 0
  );
  const activeFilterCount = countActiveTripFilters(filters);
  const isUpdating = isLoading || isPending;
  const [isSyncingCks, setIsSyncingCks] = useState(false);
  const [cksSyncMessage, setCksSyncMessage] = useState<string | undefined>();
  const cksSyncTriggeredRef = useRef(false);
  const canSyncCks = data?.organization.currentUser?.canSyncCuaKhauSoIntegration ?? false;
  const [additionalTrips, setAdditionalTrips] = useState<TripsViewData['trips']>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const allTrips = useMemo(() => {
    const combined = [...(data?.trips ?? []), ...additionalTrips];
    const seen = new Set<string>();
    return combined.filter((trip) => {
      if (seen.has(trip.id)) return false;
      seen.add(trip.id);
      return true;
    });
  }, [data?.trips, additionalTrips]);

  const applySearchDebounced = useCallback(() => {
    const trimmed = search.trim();
    const currentSearch = filters.search ?? '';

    if (trimmed === currentSearch) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);

    if (trimmed) {
      nextParams.set('search', trimmed);
    } else {
      nextParams.delete('search');
    }

    startTransition(() => {
      router.push(`/trips?${nextParams.toString()}`);
    });
  }, [search, filters.search, searchParams, router, startTransition]);

  useEffect(() => {
    const timer = setTimeout(applySearchDebounced, 300);
    return () => clearTimeout(timer);
  }, [applySearchDebounced]);

  useEffect(() => {
    setSearch(filters.search ?? '');
    setStatus(filters.status ?? '');
    setBorderGateId(filters.borderGateId ?? '');
    setYardId(filters.yardId ?? '');
    setDriverProfileId(filters.driverProfileId ?? '');
    setVehicleId(filters.vehicleId ?? '');
    setCargoOwnerOrganizationId(filters.cargoOwnerOrganizationId ?? '');
    setException(filters.exception ?? '');
    setFrom(toDateInputValue(filters.from));
    setTo(toDateInputValue(filters.to));
    setAdditionalTrips([]);
    setHasMore(true);
  }, [filters]);

  useEffect(() => {
    if (initialSearchKey === searchKey && hasInitialState && loadedSearchKey !== searchKey) {
      setData(initialData);
      setError(initialError);
      setOrganizationIssue(initialOrganizationIssue);
      setLoadedSearchKey(searchKey);
      setIsLoading(false);
      return;
    }

    if (loadedSearchKey === searchKey) {
      return;
    }

    let isMounted = true;

    async function loadData() {
      setIsLoading(true);
      setError(undefined);
      setOrganizationIssue(undefined);

      try {
        const result = await loadTripsData(filters);

        if (isMounted) {
          setData(result);
          setLoadedSearchKey(searchKey);
        }
      } catch (loadError) {
        if (isMounted) {
          if (isOrganizationAccessError(loadError)) {
            setOrganizationIssue(loadError.issue);
          }

          setError(
            loadError instanceof Error ? loadError.message : 'Không thể tải danh sách chuyến.'
          );
          setLoadedSearchKey(searchKey);
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
  }, [
    filters,
    hasInitialState,
    initialData,
    initialError,
    initialOrganizationIssue,
    initialSearchKey,
    loadedSearchKey,
    searchKey
  ]);

  async function triggerCksSync() {
    setIsSyncingCks(true);
    setCksSyncMessage(undefined);

    try {
      const result = await runCuaKhauSoSyncNow();

      if (result.skipped) {
        if (result.reason === 'THROTTLED') {
          setCksSyncMessage(
            'GateSync vừa kiểm tra nguồn Cửa khẩu số, vui lòng chờ một chút trước khi thử lại.'
          );
        } else {
          setCksSyncMessage(
            'Worker khác đang đối chiếu Cửa khẩu số. Dữ liệu hiện tại đã là mới nhất.'
          );
        }
      } else {
        setCksSyncMessage(
          `Đã cập nhật ${result.detailsFetched} tờ khai từ Cửa khẩu số, ${result.eventsCreated} sự kiện mới.`
        );
      }

      const freshData = await loadTripsData(filters);
      setData(freshData);
      setAdditionalTrips([]);
      setHasMore(true);
      setError(undefined);
    } catch (syncError) {
      const msg = syncError instanceof Error ? syncError.message : '';

      if (!msg.includes('vừa kiểm tra')) {
        setCksSyncMessage(msg || 'Không thể đồng bộ từ Cửa khẩu số.');
      }
    } finally {
      setIsSyncingCks(false);
    }
  }

  useEffect(() => {
    if (cksSyncTriggeredRef.current) return;
    if (!canSyncCks) return;
    if (isLoading) return;

    cksSyncTriggeredRef.current = true;
    void triggerCksSync();
  }, [canSyncCks, isLoading]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) {
      return;
    }

    const lastTrip = allTrips[allTrips.length - 1];

    if (!lastTrip) {
      setHasMore(false);
      return;
    }

    setIsLoadingMore(true);

    try {
      const pageSize = 50;
      const result = await loadTripsData({ ...filters, cursor: lastTrip.id, limit: pageSize });

      if (result.trips.length === 0 || result.trips.length < pageSize) {
        setHasMore(false);
      }

      if (result.trips.length > 0) {
        setAdditionalTrips((current) => [...current, ...result.trips]);
      }
    } catch {
      setHasMore(false);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, allTrips, filters]);

  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (!sentinel || !hasMore || isLoadingMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, isLoadingMore, loadMore]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextParams = new URLSearchParams();

    if (search.trim()) {
      nextParams.set('search', search.trim());
    }

    if (isTripStatus(status)) {
      nextParams.set('status', status);
    }

    if (borderGateId.trim()) {
      nextParams.set('borderGateId', borderGateId.trim());
    }

    if (yardId.trim()) {
      nextParams.set('yardId', yardId.trim());
    }

    if (driverProfileId.trim()) {
      nextParams.set('driverProfileId', driverProfileId.trim());
    }

    if (vehicleId.trim()) {
      nextParams.set('vehicleId', vehicleId.trim());
    }

    if (cargoOwnerOrganizationId.trim()) {
      nextParams.set('cargoOwnerOrganizationId', cargoOwnerOrganizationId.trim());
    }

    if (isTripExceptionFilter(exception)) {
      nextParams.set('exception', exception);
    }

    if (from) {
      nextParams.set('from', from);
    }

    if (to) {
      nextParams.set('to', to);
    }

    const query = nextParams.toString();
    startTransition(() => {
      router.push(query ? `/trips?${query}` : '/trips');
    });
  }

  function resetFilters() {
    startTransition(() => {
      router.push('/trips');
    });
  }

  return (
    <AppShell
      activeNav="trips"
      eyebrow="Quản lý chuyến đi"
      title="Danh sách chuyến đang vận hành"
      description="Tìm nhanh chuyến theo mã, biển số, tài xế, cửa khẩu và ưu tiên xử lý các chuyến đang chậm hoặc cần xác nhận."
      {...shellProps}
      action={
        <Link
          href={priorityTrip ? `/trips/${priorityTrip.id}` : '/trips'}
          className="rounded-2xl bg-slate-950 px-5 py-3 text-center text-sm font-semibold text-white shadow-soft transition hover:bg-slate-800"
        >
          Mở chuyến ưu tiên
        </Link>
      }
    >
      {data?.notice ? (
        <div className="rounded-3xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-800">
          {data.notice}
        </div>
      ) : null}

      {!isLoading && organizationIssue && error ? (
        <NoOrganizationState issue={organizationIssue} message={error} />
      ) : null}

      {!organizationIssue ? (
        <>
          <section className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-3 shadow-soft sm:p-4">
            <div className="flex items-center justify-end">
              <p className="text-xs font-semibold text-slate-500">
                {activeFilterCount > 0
                  ? `${activeFilterCount} bộ lọc đang áp dụng`
                  : 'Chưa dùng bộ lọc nâng cao'}
              </p>
            </div>
            <form onSubmit={applyFilters} className="mt-3 grid gap-3">
              <div className="grid gap-3 xl:grid-cols-[1.45fr_0.8fr_0.8fr_auto] xl:items-end">
                <SearchInput
                  label="Tìm chuyến"
                  placeholder="Mã chuyến, biển số, tài xế hoặc cửa khẩu"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <SelectInput
                  label="Trạng thái"
                  value={status}
                  options={[
                    { value: '', label: 'Tất cả' },
                    ...tripStatuses.map((tripStatus) => ({
                      value: tripStatus,
                      label: tripStatusLabels[tripStatus]
                    }))
                  ]}
                  onChange={(event) => setStatus(event.target.value)}
                />
                <SelectInput
                  label="Ngoại lệ"
                  value={exception}
                  options={[
                    { value: '', label: 'Tất cả ngoại lệ' },
                    ...tripExceptionFilters.map((filter) => ({
                      value: filter,
                      label: tripExceptionFilterLabels[filter]
                    }))
                  ]}
                  onChange={(event) => setException(event.target.value)}
                />
                <div className="grid grid-cols-2 gap-2 xl:w-44">
                  <Button disabled={isUpdating}>{isUpdating ? 'Đang tải...' : 'Tìm kiếm'}</Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isUpdating}
                    onClick={resetFilters}
                  >
                    Đặt lại
                  </Button>
                </div>
              </div>

              <details
                key={`advanced-${searchKey}`}
                open={hasAdvancedTripFilters(filters) || undefined}
                className="rounded-3xl border border-slate-100 bg-slate-50 p-4"
              >
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                  Lọc nâng cao
                  <span className="ml-2 rounded-full bg-white px-3 py-1 text-xs text-slate-500">
                    {activeFilterCount} bộ lọc đang dùng
                  </span>
                </summary>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <TextInput
                    label="Cửa khẩu"
                    placeholder="Mã cửa khẩu"
                    value={borderGateId}
                    onChange={(event) => setBorderGateId(event.target.value)}
                  />
                  <TextInput
                    label="Bãi"
                    placeholder="Mã bãi"
                    value={yardId}
                    onChange={(event) => setYardId(event.target.value)}
                  />
                  <TextInput
                    label="Tài xế"
                    placeholder="Mã hồ sơ tài xế"
                    value={driverProfileId}
                    onChange={(event) => setDriverProfileId(event.target.value)}
                  />
                  <TextInput
                    label="Phương tiện"
                    placeholder="Mã phương tiện"
                    value={vehicleId}
                    onChange={(event) => setVehicleId(event.target.value)}
                  />
                  <TextInput
                    label="Chủ hàng"
                    placeholder="Mã tổ chức chủ hàng"
                    value={cargoOwnerOrganizationId}
                    onChange={(event) => setCargoOwnerOrganizationId(event.target.value)}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DateInput
                      label="Từ ngày"
                      value={from}
                      onChange={(event) => setFrom(event.target.value)}
                    />
                    <DateInput
                      label="Đến ngày"
                      value={to}
                      onChange={(event) => setTo(event.target.value)}
                    />
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <FilterSummary
                    label="Trạng thái"
                    value={filters.status ? tripStatusLabels[filters.status] : 'Tất cả'}
                  />
                  <FilterSummary
                    label="Ngoại lệ"
                    value={
                      filters.exception
                        ? tripExceptionFilterLabels[filters.exception]
                        : 'Tất cả ngoại lệ'
                    }
                  />
                  <FilterSummary
                    label="Vị trí"
                    value={
                      filters.borderGateId || filters.yardId
                        ? 'Đang lọc cửa khẩu/bãi'
                        : 'Tất cả cửa khẩu/bãi'
                    }
                  />
                  <FilterSummary
                    label="Khoảng ngày"
                    value={formatDateRange(filters.from, filters.to)}
                    suppressHydrationWarning
                  />
                </div>
              </details>
            </form>
          </section>

          <section className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                  Hàng chờ vận hành
                </p>
                <div className="flex items-center gap-3">
                  <h2 className="mt-2 text-2xl font-bold text-slate-950">
                    {isLoading ? 'Đang tải chuyến...' : `${allTrips.length} chuyến cần theo dõi`}
                  </h2>
                  {canSyncCks ? (
                    <button
                      type="button"
                      onClick={triggerCksSync}
                      disabled={isSyncingCks || isLoading}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-sky-300 hover:text-sky-700 disabled:opacity-50"
                      title="Cập nhật dữ liệu từ Cửa khẩu số"
                    >
                      <svg
                        className={`h-3.5 w-3.5 ${isSyncingCks ? 'animate-spin' : ''}`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                      </svg>
                      {isSyncingCks ? 'Đang cập nhật...' : 'Cập nhật CKS'}
                    </button>
                  ) : null}
                </div>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">
                Chuyến chưa hoàn thành được ưu tiên trước, các chuyến đã hoàn thành được xếp xuống
                dưới.
              </p>
            </div>
            {cksSyncMessage ? (
              <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-2 text-xs font-medium text-sky-700">
                {cksSyncMessage}
              </div>
            ) : null}

            {isLoading ? (
              <StatePanel
                tone="loading"
                className="mt-5"
                message="Đang tải danh sách chuyến từ GateSync API..."
              />
            ) : null}
            {!isLoading && error ? (
              <StatePanel tone="error" className="mt-5" message={error} />
            ) : null}
            {!isLoading && !error && allTrips.length === 0 ? (
              <StatePanel
                className="mt-5"
                message="Không có chuyến phù hợp. Hãy nới bộ lọc hoặc tạo chuyến mới từ API vận hành."
              />
            ) : null}
            {!isLoading && !error && allTrips.length > 0 ? (
              <TripsList trips={allTrips} sentinelRef={sentinelRef} isLoadingMore={isLoadingMore} />
            ) : null}
          </section>
        </>
      ) : null}
    </AppShell>
  );
}

function TripsList({
  trips,
  sentinelRef,
  isLoadingMore
}: {
  trips: TripsViewData['trips'];
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  isLoadingMore: boolean;
}) {
  return (
    <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
      <div className="hidden grid-cols-[0.35fr_1fr_1fr_0.9fr_1fr_0.75fr_0.85fr] gap-4 bg-slate-950 px-5 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300 xl:grid">
        <span>STT</span>
        <span>Chuyến</span>
        <span>Phương tiện & tài xế</span>
        <span>Doanh nghiệp hàng hóa</span>
        <span>Tờ khai CKS</span>
        <span>Tiến độ</span>
        <span>Ưu tiên</span>
      </div>
      <div className="divide-y divide-slate-100 bg-white">
        {trips.map((trip, index) => (
          <Link
            key={trip.id}
            href={`/trips/${trip.id}`}
            className="grid gap-4 px-4 py-5 transition hover:bg-sky-50/60 sm:px-5 xl:grid-cols-[0.35fr_1fr_1fr_0.9fr_1fr_0.75fr_0.85fr] xl:items-center"
          >
            <div className="hidden text-center text-sm font-bold text-slate-600 xl:block">
              {index + 1}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 xl:block">
                <p className="font-semibold text-slate-950">{trip.tripCode}</p>
                <div className="xl:mt-2">
                  <TripStatusBadge status={trip.currentStatus} />
                </div>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {tripTypeLabels[trip.tripType]?.replace(' có hàng', '')}
              </p>
              <p className="mt-1 text-xs font-medium text-sky-700">{trip.borderGate}</p>
            </div>
            <div>
              <p className="font-medium text-slate-800" title="Biển số xe">
                {trip.vehicle.plateNumber}
              </p>
              {trip.trailerNumber ? (
                <p className="mt-1 text-xs text-slate-600" title="Số mooc">
                  Mooc: {trip.trailerNumber}
                </p>
              ) : null}
              {trip.transshipmentPlateNumber ? (
                <p className="mt-1 text-xs text-amber-700" title="Biển xe sang tải">
                  Sang tải: {trip.transshipmentPlateNumber}
                </p>
              ) : null}
              <div className="mt-2">
                <p className="text-sm text-slate-600">{trip.driver.name}</p>
                <p className="text-xs text-slate-500">{trip.driver.phone}</p>
              </div>
            </div>
            <div>
              {trip.companies.length > 0 ? (
                <div className="space-y-1">
                  {trip.companies.map((company, idx) => (
                    <p
                      key={idx}
                      className="text-sm font-medium text-slate-800 line-clamp-2"
                      title={company}
                    >
                      {company}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Chưa có thông tin</p>
              )}
              {trip.customsDeclarationsCount > 1 ? (
                <p className="mt-1 text-xs font-semibold text-sky-700">
                  Gộp {trip.customsDeclarationsCount} tờ khai HQ
                </p>
              ) : null}
            </div>
            <DeclarationSignal signal={trip.declarationSignal} />
            <div className="space-y-2">
              {trip.procedureStepStatus ? (
                <p className="mb-2 inline-block rounded-lg border border-sky-100 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">
                  Bước: {trip.procedureStepStatus}
                </p>
              ) : null}
              <p className="text-xs font-semibold text-amber-700">
                {formatDelay(trip.delayMinutes)}
              </p>
              <p className="text-xs text-slate-500" suppressHydrationWarning>
                Cập nhật trạng thái: {trip.statusUpdatedAt}
              </p>
            </div>
            <div className="space-y-2">
              <PriorityBadge priority={trip.priority} />
              <div>
                <p className="text-xs font-semibold text-slate-700">{trip.nextActionLabel}</p>
                <p className="mt-1 text-xs leading-4 text-slate-500 line-clamp-2">
                  {trip.nextAction}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
      <div ref={sentinelRef} className="h-1" />
      {isLoadingMore ? (
        <div className="flex items-center justify-center bg-white py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-sky-600" />
          <span className="ml-2 text-xs text-slate-500">Đang tải thêm...</span>
        </div>
      ) : null}
    </div>
  );
}

function DeclarationSignal({
  signal
}: {
  signal: TripsViewData['trips'][number]['declarationSignal'];
}) {
  if (!signal) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Chưa có tờ khai Cửa khẩu số
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-sky-100 bg-sky-50 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-slate-950">{signal.number}</span>
        <span
          suppressHydrationWarning
          className={`rounded-full px-2 py-0.5 text-[0.68rem] font-bold ${
            signal.stale ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {signal.freshness}
        </span>
      </div>
      <p className="mt-1 text-xs font-semibold text-slate-700">{signal.status}</p>
      <p className="mt-1 text-xs text-slate-500">{signal.paymentStatus}</p>
      {signal.warnings.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {signal.warnings.slice(0, 2).map((warning) => (
            <span
              key={warning.code}
              className={`rounded-full px-2 py-0.5 text-[0.68rem] font-bold ring-1 ${warning.tone}`}
            >
              {warning.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}



function FilterSummary({
  label,
  value,
  suppressHydrationWarning
}: {
  label: string;
  value: string;
  suppressHydrationWarning?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-800" suppressHydrationWarning={suppressHydrationWarning}>
        {value}
      </p>
    </div>
  );
}

function formatDateRange(from?: string, to?: string) {
  const fromValue = toDateInputValue(from);
  const toValue = toDateInputValue(to);

  if (!fromValue && !toValue) {
    return 'Không giới hạn';
  }

  return `${fromValue || '...'} → ${toValue || '...'}`;
}

function toDateInputValue(value?: string) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().slice(0, 10);
}
