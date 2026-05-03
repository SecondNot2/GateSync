import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { PriorityBadge, TripStatusBadge } from '@/components/status-badge';
import { TripTimeline } from '@/components/trip-timeline';
import { getTripById } from '@/lib/demo-data';
import {
  formatDelay,
  tripDirectionLabels,
  tripEventSourceLabels,
  tripStatusLabels,
  tripTypeLabels,
  vehicleTypeLabels
} from '@/lib/ui-labels';

type TripDetailPageProps = {
  params: Promise<{
    tripId: string;
  }>;
};

export default async function TripDetailPage({ params }: TripDetailPageProps) {
  const { tripId } = await params;
  const trip = getTripById(tripId);

  if (!trip) {
    notFound();
  }

  const latestEvent = trip.events[trip.events.length - 1];

  return (
    <AppShell
      activeNav="trips"
      eyebrow="Chi tiết chuyến"
      title={trip.tripCode}
      description="Xem trạng thái hiện tại, việc cần làm tiếp theo, thông tin vận hành và lịch sử sự kiện của chuyến."
      action={
        <Link
          href="/trips"
          className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
        >
          Quay lại danh sách
        </Link>
      }
    >
      <section className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap gap-2">
                <TripStatusBadge status={trip.currentStatus} />
                <PriorityBadge priority={trip.priority} />
              </div>
              <h2 className="mt-4 text-3xl font-bold text-slate-950">
                {tripTypeLabels[trip.tripType]}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {tripDirectionLabels[trip.direction]} · Cập nhật trạng thái lúc{' '}
                {trip.statusUpdatedAt}
              </p>
            </div>
            <div className="rounded-3xl border border-amber-100 bg-amber-50 px-5 py-4 text-slate-950">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                Tiến độ
              </p>
              <p className="mt-2 text-2xl font-bold text-amber-800">
                {formatDelay(trip.delayMinutes)}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Phương tiện
              </p>
              <p className="mt-2 font-semibold text-slate-950">{trip.vehicle.plateNumber}</p>
              <p className="mt-1 text-sm text-slate-600">{vehicleTypeLabels[trip.vehicle.type]}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Tài xế
              </p>
              <p className="mt-2 font-semibold text-slate-950">{trip.driver.name}</p>
              <p className="mt-1 text-sm text-slate-600">{trip.driver.phone}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Cửa khẩu
              </p>
              <p className="mt-2 font-semibold text-slate-950">{trip.borderGate}</p>
              <p className="mt-1 text-sm text-slate-600">{trip.yard}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Trạng thái
              </p>
              <p className="mt-2 font-semibold text-slate-950">
                {tripStatusLabels[trip.currentStatus]}
              </p>
              <p className="mt-1 text-sm text-slate-600">{trip.events.length} sự kiện</p>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-sky-100 bg-sky-50 p-5">
            <p className="text-sm font-semibold text-sky-900">Việc cần làm tiếp theo</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{trip.nextAction}</p>
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Thao tác nhanh
            </p>
            <div className="mt-4 grid gap-3">
              <button className="min-h-12 rounded-2xl bg-slate-950 px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-slate-800">
                Ghi nhận sự kiện mới
              </button>
              <button className="min-h-12 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm font-semibold text-amber-800 transition hover:bg-amber-100">
                Đánh dấu cần theo dõi chậm
              </button>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Hàng hóa & tờ khai
            </p>
            <div className="mt-4 space-y-4 text-sm text-slate-600">
              <div>
                <p className="font-semibold text-slate-950">{trip.shipment.description}</p>
                <p className="mt-1">Số container: {trip.shipment.containerNumber}</p>
                <p className="mt-1">Số niêm phong: {trip.shipment.sealNumber}</p>
                <p className="mt-1">Khối lượng: {trip.shipment.weightKg}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p>Tờ khai: {trip.declaration.number}</p>
                <p className="mt-1">Trạng thái: {trip.declaration.status}</p>
                <p className="mt-1">Chi cục: {trip.declaration.customsOfficeCode}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Phân quyền xem
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {trip.participants.map((participant) => (
                <span
                  key={participant}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                >
                  {participant}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_24rem]">
        <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Dòng thời gian sự kiện
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">Lịch sử vận hành</h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-600">
              Mỗi sự kiện thể hiện một mốc vận hành quan trọng để đội điều phối theo dõi lại lịch sử
              chuyến.
            </p>
          </div>
          <div className="mt-5">
            <TripTimeline events={trip.events} />
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 text-slate-950 shadow-soft sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Sự kiện mới nhất
          </p>
          {latestEvent ? (
            <div className="mt-5 rounded-3xl border border-slate-100 bg-slate-50 p-4">
              <p className="font-semibold">{latestEvent.occurredAt}</p>
              <p className="mt-3 text-sm leading-6 text-slate-700">{latestEvent.note}</p>
              <p className="mt-4 text-xs font-semibold text-sky-700">
                Nguồn: {tripEventSourceLabels[latestEvent.source]}
              </p>
            </div>
          ) : (
            <div className="mt-5 rounded-3xl border border-dashed border-slate-200 p-4 text-sm text-slate-600">
              Chưa có sự kiện nào được ghi nhận cho chuyến này.
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
