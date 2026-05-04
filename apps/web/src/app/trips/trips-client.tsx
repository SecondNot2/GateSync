'use client';

import { tripExceptionFilters, tripStatuses, type TripExceptionFilter, type TripStatus } from '@gatesync/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { PriorityBadge, TripStatusBadge } from '@/components/status-badge';
import type { ListTripsParams } from '@/lib/api/types';
import { loadTripsData } from '@/lib/operations/data';
import type { TripsViewData } from '@/lib/operations/view-model';
import {
  formatDelay,
  tripDirectionLabels,
  tripExceptionFilterLabels,
  tripStatusLabels,
  tripTypeLabels
} from '@/lib/ui-labels';

export function TripsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const filters = useMemo(() => toFilters(searchParams), [searchParams]);
  const [data, setData] = useState<TripsViewData>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
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
  const priorityTrip = data?.trips.find((trip) => trip.priority !== 'NORMAL' || trip.delayMinutes > 0);

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
  }, [filters]);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setIsLoading(true);
      setError(undefined);

      try {
        const result = await loadTripsData(filters);

        if (isMounted) {
          setData(result);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : 'Không thể tải danh sách chuyến.');
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
  }, [filters, searchKey]);

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
      nextParams.set('from', `${from}T00:00:00.000Z`);
    }

    if (to) {
      nextParams.set('to', `${to}T23:59:59.999Z`);
    }

    const query = nextParams.toString();
    router.push(query ? `/trips?${query}` : '/trips');
  }

  function resetFilters() {
    router.push('/trips');
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

      <section className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
        <form onSubmit={applyFilters} className="grid gap-3 xl:grid-cols-[1.4fr_0.8fr_0.8fr] xl:items-end">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Tìm chuyến
            </span>
            <input
              className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              placeholder="Nhập mã chuyến, biển số, tài xế hoặc cửa khẩu"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Trạng thái
            </span>
            <select
              className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">Tất cả trạng thái</option>
              {tripStatuses.map((tripStatus) => (
                <option key={tripStatus} value={tripStatus}>
                  {tripStatusLabels[tripStatus]}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button className="min-h-12 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
              Tìm kiếm
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
            >
              Đặt lại lọc
            </button>
          </div>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Cửa khẩu
            </span>
            <input
              className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              placeholder="Mã cửa khẩu trong hệ thống"
              value={borderGateId}
              onChange={(event) => setBorderGateId(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Bãi
            </span>
            <input
              className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              placeholder="Mã bãi trong hệ thống"
              value={yardId}
              onChange={(event) => setYardId(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Ngoại lệ
            </span>
            <select
              className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              value={exception}
              onChange={(event) => setException(event.target.value)}
            >
              <option value="">Tất cả ngoại lệ</option>
              {tripExceptionFilters.map((filter) => (
                <option key={filter} value={filter}>
                  {tripExceptionFilterLabels[filter]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Tài xế
            </span>
            <input
              className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              placeholder="Mã hồ sơ tài xế"
              value={driverProfileId}
              onChange={(event) => setDriverProfileId(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Phương tiện
            </span>
            <input
              className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              placeholder="Mã phương tiện"
              value={vehicleId}
              onChange={(event) => setVehicleId(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Chủ hàng
            </span>
            <input
              className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              placeholder="Mã tổ chức chủ hàng"
              value={cargoOwnerOrganizationId}
              onChange={(event) => setCargoOwnerOrganizationId(event.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Từ ngày
              </span>
              <input
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Đến ngày
              </span>
              <input
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </div>
        </form>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
          <FilterSummary label="Trạng thái" value={filters.status ? tripStatusLabels[filters.status] : 'Tất cả trạng thái'} />
          <FilterSummary label="Ngoại lệ" value={filters.exception ? tripExceptionFilterLabels[filters.exception] : 'Tất cả ngoại lệ'} />
          <FilterSummary label="Cửa khẩu" value={filters.borderGateId ? 'Đang lọc theo mã' : 'Tất cả cửa khẩu'} />
          <FilterSummary label="Bãi" value={filters.yardId ? 'Đang lọc theo mã' : 'Tất cả bãi'} />
          <FilterSummary label="Tài xế" value={filters.driverProfileId ? 'Đang lọc theo mã' : 'Tất cả tài xế'} />
          <FilterSummary label="Phương tiện" value={filters.vehicleId ? 'Đang lọc theo mã' : 'Tất cả xe'} />
          <FilterSummary label="Chủ hàng" value={filters.cargoOwnerOrganizationId ? 'Đang lọc theo mã' : 'Tất cả chủ hàng'} />
          <FilterSummary label="Khoảng ngày" value={formatDateRange(filters.from, filters.to)} />
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Hàng chờ vận hành
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              {isLoading ? 'Đang tải chuyến...' : `${data?.trips.length ?? 0} chuyến cần theo dõi`}
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Sắp xếp theo mức độ cần theo dõi để điều phối viên mở đúng chuyến trước.
          </p>
        </div>

        {isLoading ? <StatePanel message="Đang tải danh sách chuyến từ GateSync API..." /> : null}
        {!isLoading && error ? <StatePanel tone="error" message={error} /> : null}
        {!isLoading && !error && data?.trips.length === 0 ? (
          <StatePanel message="Không có chuyến phù hợp. Hãy nới bộ lọc hoặc tạo chuyến mới từ API vận hành." />
        ) : null}
        {!isLoading && !error && data && data.trips.length > 0 ? <TripsList data={data} /> : null}
      </section>
    </AppShell>
  );
}

function TripsList({ data }: { data: TripsViewData }) {
  return (
    <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
      <div className="hidden grid-cols-[1fr_1fr_0.9fr_0.8fr_0.8fr] gap-4 bg-slate-950 px-5 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300 xl:grid">
        <span>Chuyến</span>
        <span>Phương tiện & tài xế</span>
        <span>Cửa khẩu/bãi</span>
        <span>Tiến độ</span>
        <span>Ưu tiên</span>
      </div>
      <div className="divide-y divide-slate-100 bg-white">
        {data.trips.map((trip) => (
          <Link
            key={trip.id}
            href={`/trips/${trip.id}`}
            className="grid gap-4 px-4 py-5 transition hover:bg-sky-50/60 sm:px-5 xl:grid-cols-[1fr_1fr_0.9fr_0.8fr_0.8fr] xl:items-center"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2 xl:block">
                <p className="font-semibold text-slate-950">{trip.tripCode}</p>
                <div className="xl:mt-2">
                  <TripStatusBadge status={trip.currentStatus} />
                </div>
              </div>
              <p className="mt-1 text-sm text-slate-600">{tripTypeLabels[trip.tripType]}</p>
              <p className="mt-1 text-xs text-slate-500">
                {tripDirectionLabels[trip.direction]}
              </p>
            </div>
            <div>
              <p className="font-medium text-slate-800">{trip.vehicle.plateNumber}</p>
              <p className="mt-1 text-sm text-slate-600">{trip.driver.name}</p>
              <p className="mt-1 text-xs text-slate-500">{trip.driver.phone}</p>
            </div>
            <div>
              <p className="font-medium text-slate-800">{trip.borderGate}</p>
              <p className="mt-1 text-sm text-slate-600">{trip.yard}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-amber-700">
                {formatDelay(trip.delayMinutes)}
              </p>
            </div>
            <div className="space-y-3">
              <PriorityBadge priority={trip.priority} />
              <p className="text-xs leading-5 text-slate-500">{trip.nextAction}</p>
              <span className="inline-flex text-sm font-semibold text-sky-700">Xem chi tiết</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function FilterSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function StatePanel({ message, tone = 'default' }: { message: string; tone?: 'default' | 'error' }) {
  const className =
    tone === 'error'
      ? 'border-rose-100 bg-rose-50 text-rose-700'
      : 'border-dashed border-slate-200 bg-slate-50 text-slate-600';

  return <div className={`mt-5 rounded-3xl border p-5 text-sm ${className}`}>{message}</div>;
}

function toFilters(searchParams: URLSearchParams): ListTripsParams {
  const filters: ListTripsParams = {
    limit: 50
  };
  const search = searchParams.get('search')?.trim();
  const status = searchParams.get('status');
  const borderGateId = searchParams.get('borderGateId')?.trim();
  const yardId = searchParams.get('yardId')?.trim();
  const driverProfileId = searchParams.get('driverProfileId')?.trim();
  const vehicleId = searchParams.get('vehicleId')?.trim();
  const cargoOwnerOrganizationId = searchParams.get('cargoOwnerOrganizationId')?.trim();
  const exception = searchParams.get('exception');
  const from = searchParams.get('from')?.trim();
  const to = searchParams.get('to')?.trim();

  if (search) {
    filters.search = search;
  }

  if (isTripStatus(status)) {
    filters.status = status;
  }

  if (borderGateId) {
    filters.borderGateId = borderGateId;
  }

  if (yardId) {
    filters.yardId = yardId;
  }

  if (driverProfileId) {
    filters.driverProfileId = driverProfileId;
  }

  if (vehicleId) {
    filters.vehicleId = vehicleId;
  }

  if (cargoOwnerOrganizationId) {
    filters.cargoOwnerOrganizationId = cargoOwnerOrganizationId;
  }

  if (isTripExceptionFilter(exception)) {
    filters.exception = exception;
  }

  if (from) {
    filters.from = from;
  }

  if (to) {
    filters.to = to;
  }

  return filters;
}

function isTripStatus(value: string | null): value is TripStatus {
  return tripStatuses.some((status) => status === value);
}

function isTripExceptionFilter(value: string | null): value is TripExceptionFilter {
  return tripExceptionFilters.some((filter) => filter === value);
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
