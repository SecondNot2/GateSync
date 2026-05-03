'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { PriorityBadge, TripStatusBadge } from '@/components/status-badge';
import { loadDashboardData } from '@/lib/operations/data';
import type { DashboardViewData } from '@/lib/operations/view-model';
import {
  formatDelay,
  tripEventSourceLabels,
  tripEventTypeLabels,
  tripStatusLabels
} from '@/lib/ui-labels';

export function DashboardClient() {
  const [data, setData] = useState<DashboardViewData>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const shellProps = data?.organization ? { organization: data.organization } : {};

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setIsLoading(true);
      setError(undefined);

      try {
        const result = await loadDashboardData();

        if (isMounted) {
          setData(result);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error ? loadError.message : 'Không thể tải bảng điều phối.'
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
  }, []);

  return (
    <AppShell
      activeNav="dashboard"
      eyebrow="Vận hành thời gian thực"
      title="Bảng điều phối cửa khẩu"
      description="Ưu tiên việc cần xử lý trước, sau đó theo dõi luồng xe, cảnh báo và sự kiện mới trong ca trực."
      {...shellProps}
      action={
        <Link
          href="/trips"
          className="rounded-2xl bg-slate-950 px-5 py-3 text-center text-sm font-semibold text-white shadow-soft transition hover:bg-slate-800"
        >
          Mở danh sách chuyến
        </Link>
      }
    >
      {isLoading ? <DashboardLoadingState /> : null}
      {!isLoading && error ? <DashboardErrorState message={error} /> : null}
      {!isLoading && !error && data ? <DashboardContent data={data} /> : null}
    </AppShell>
  );
}

function DashboardContent({ data }: { data: DashboardViewData }) {
  return (
    <>
      {data.notice ? (
        <div className="rounded-3xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-800">
          {data.notice}
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">
                Việc cần xử lý
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">Ưu tiên trong ca trực</h2>
            </div>
            <Link href="/trips" className="text-sm font-semibold text-sky-700 hover:text-sky-900">
              Xem tất cả chuyến
            </Link>
          </div>
          {data.urgentTrips.length > 0 ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              {data.urgentTrips.slice(0, 3).map((trip) => (
                <Link
                  key={trip.id}
                  href={`/trips/${trip.id}`}
                  className="block rounded-3xl border border-slate-100 bg-slate-50 p-4 transition hover:border-sky-200 hover:bg-sky-50/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{trip.tripCode}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {trip.vehicle.plateNumber} · {trip.borderGate}
                      </p>
                    </div>
                    <PriorityBadge priority={trip.priority} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{trip.nextAction}</p>
                  <p className="mt-3 text-xs font-semibold text-amber-700">
                    {formatDelay(trip.delayMinutes)}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyPanel message="Chưa có chuyến ưu tiên trong ca trực hiện tại." />
          )}
        </div>

        <div className="rounded-[1.75rem] border border-amber-100 bg-amber-50 p-4 shadow-soft sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
            Tóm tắt ca trực
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{data.urgentTrips.length}</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Chuyến đang có ưu tiên hoặc chậm tiến độ cần điều phối viên theo dõi.
          </p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-[1.5rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5"
          >
            <div className={`h-1.5 w-12 rounded-full ${metric.indicatorClass}`} />
            <p className="mt-4 text-sm font-medium text-slate-500">{metric.label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{metric.value}</p>
            <p className="mt-2 text-sm text-slate-600">{metric.trend}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_24rem]">
        <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Nhóm trạng thái
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">Luồng xe trong ngày</h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-600">
              Các nhóm này bám theo luồng vận hành, giúp điều phối viên phát hiện khu vực bị nghẽn
              nhanh hơn.
            </p>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {data.statusGroups.map((group) => (
              <div
                key={group.label}
                className="rounded-3xl border border-slate-100 bg-slate-50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{group.label}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{group.description}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-sm font-bold ${group.tone}`}>
                    {group.count}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {group.statuses.map((status) => (
                    <span
                      key={status}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
                    >
                      {tripStatusLabels[status]}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Gợi ý điều phối
          </p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Theo dõi theo khu vực</h2>
          <div className="mt-5 space-y-3 text-sm leading-6 text-slate-700">
            <p className="rounded-3xl bg-slate-50 p-4">
              Ưu tiên kiểm tra các chuyến đang chờ bãi quá lâu.
            </p>
            <p className="rounded-3xl bg-slate-50 p-4">
              Đối chiếu lại tờ khai với các chuyến đang xử lý hải quan.
            </p>
            <p className="rounded-3xl bg-slate-50 p-4">
              Liên hệ tài xế khi có sự kiện mới nhưng chưa xác nhận.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Hàng chờ điều phối
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">Chuyến nổi bật</h2>
            </div>
            <Link href="/trips" className="text-sm font-semibold text-sky-700 hover:text-sky-900">
              Xem tất cả
            </Link>
          </div>
          {data.featuredTrips.length > 0 ? (
            <div className="mt-5 space-y-3">
              {data.featuredTrips.map((trip) => (
                <Link
                  key={trip.id}
                  href={`/trips/${trip.id}`}
                  className="grid gap-3 rounded-3xl border border-slate-100 bg-slate-50 p-4 transition hover:border-sky-200 hover:bg-sky-50/60 lg:grid-cols-[1.1fr_0.8fr_auto] lg:items-center"
                >
                  <div>
                    <p className="font-semibold text-slate-950">{trip.tripCode}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {trip.vehicle.plateNumber} · {trip.driver.name}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">{trip.borderGate}</p>
                    <p className="mt-1 text-xs text-slate-500">{trip.yard}</p>
                  </div>
                  <TripStatusBadge status={trip.currentStatus} />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyPanel message="Chưa có chuyến nào cần hiển thị." />
          )}
        </div>

        <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Sự kiện gần đây
          </p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Sự kiện mới ghi nhận</h2>
          {data.recentEvents.length > 0 ? (
            <div className="mt-5 space-y-3">
              {data.recentEvents.slice(0, 6).map((event) => (
                <Link
                  key={event.id}
                  href={`/trips/${event.tripId}`}
                  className="block rounded-3xl border border-slate-100 bg-slate-50 p-4 transition hover:border-sky-200 hover:bg-sky-50/60"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {tripEventTypeLabels[event.eventType]}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {event.tripCode ?? event.tripId} · {event.borderGate ?? 'Chưa có cửa khẩu'}
                      </p>
                    </div>
                    <p className="text-xs font-semibold text-slate-500">{event.occurredAt}</p>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    {tripEventSourceLabels[event.source]}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyPanel message="Chưa có sự kiện nào được ghi nhận." />
          )}
        </div>
      </section>
    </>
  );
}

function DashboardLoadingState() {
  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-6 text-sm text-slate-600 shadow-soft">
      Đang tải dữ liệu điều phối từ GateSync API...
    </div>
  );
}

function DashboardErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-[1.75rem] border border-rose-100 bg-rose-50 p-6 text-sm text-rose-700 shadow-soft">
      {message}
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
      {message}
    </div>
  );
}
