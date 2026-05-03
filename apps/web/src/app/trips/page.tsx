import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { PriorityBadge, TripStatusBadge } from '@/components/status-badge';
import { demoTrips } from '@/lib/demo-data';
import { formatDelay, tripDirectionLabels, tripTypeLabels } from '@/lib/ui-labels';

const filterGroups = [
  {
    label: 'Trạng thái',
    value: 'Tất cả trạng thái'
  },
  {
    label: 'Cửa khẩu',
    value: 'Tất cả cửa khẩu'
  },
  {
    label: 'Bãi',
    value: 'Tất cả bãi'
  },
  {
    label: 'Tài xế',
    value: 'Tất cả tài xế'
  },
  {
    label: 'Khoảng ngày',
    value: 'Hôm nay'
  }
];

export default function TripsPage() {
  return (
    <AppShell
      activeNav="trips"
      eyebrow="Quản lý chuyến đi"
      title="Danh sách chuyến đang vận hành"
      description="Tìm nhanh chuyến theo mã, biển số, tài xế, cửa khẩu và ưu tiên xử lý các chuyến đang chậm hoặc cần xác nhận."
      action={
        <Link
          href="/trips/gs-exp-1024"
          className="rounded-2xl bg-slate-950 px-5 py-3 text-center text-sm font-semibold text-white shadow-soft transition hover:bg-slate-800"
        >
          Mở chuyến ưu tiên
        </Link>
      }
    >
      <section className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr] lg:items-end">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Tìm chuyến
            </span>
            <input
              className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              placeholder="Nhập mã chuyến, biển số, tài xế hoặc cửa khẩu"
              type="search"
            />
          </label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
            <button className="min-h-12 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
              Tìm kiếm
            </button>
            <button className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700">
              Đặt lại lọc
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {filterGroups.map((filter) => (
            <div
              key={filter.label}
              className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                {filter.label}
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-800">{filter.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-3 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Trạng thái rỗng: khi không có chuyến phù hợp, hệ thống sẽ hiển thị hướng dẫn nới bộ lọc
            hoặc tạo chuyến mới.
          </p>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500">
            Ưu tiên chuyến chậm và chuyến cần xác nhận
          </span>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Hàng chờ vận hành
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              {demoTrips.length} chuyến cần theo dõi
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Sắp xếp theo mức độ cần theo dõi để điều phối viên mở đúng chuyến trước.
          </p>
        </div>

        <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
          <div className="hidden grid-cols-[1fr_1fr_0.9fr_0.8fr_0.8fr] gap-4 bg-slate-950 px-5 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300 xl:grid">
            <span>Chuyến</span>
            <span>Phương tiện & tài xế</span>
            <span>Cửa khẩu/bãi</span>
            <span>Tiến độ</span>
            <span>Ưu tiên</span>
          </div>
          <div className="divide-y divide-slate-100 bg-white">
            {demoTrips.map((trip) => (
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
                  <span className="inline-flex text-sm font-semibold text-sky-700">
                    Xem chi tiết
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
