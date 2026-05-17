import Image from 'next/image';
import Link from 'next/link';

const stats = [
  { label: 'Chuyến đang vận hành', value: '128' },
  { label: 'Xe chậm cần xử lý', value: '14' },
  { label: 'Cảnh báo bãi/cửa khẩu', value: '7' },
  { label: 'Sự kiện hôm nay', value: '412' }
];

const highlights = [
  'Dòng thời gian sự kiện là nguồn lịch sử vận hành chính của mỗi chuyến',
  'Bảng điều phối ưu tiên chuyến chậm, cảnh báo và việc cần xử lý',
  'Danh sách chuyến hỗ trợ tìm nhanh theo mã chuyến, xe, tài xế và cửa khẩu',
  'Quản trị nội bộ tập trung vào thành viên, phương tiện và tài xế'
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-8 lg:px-12">
      <header className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white/95 px-4 py-3 shadow-soft backdrop-blur">
        <div className="flex items-center gap-3">
          <Image
            src="/gs-logo.png"
            alt="Logo GateSync"
            width={40}
            height={40}
            priority
            className="h-10 w-10 rounded-full bg-slate-950 object-cover"
          />
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-600">
              GateSync
            </p>
            <p className="text-xs text-slate-500">Tháp điều phối logistics cửa khẩu</p>
          </div>
        </div>
        <span className="hidden rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700 sm:inline-flex">
          Dành cho vận hành nội bộ
        </span>
      </header>

      <section className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
        <div>
          <p className="mb-5 inline-flex rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700">
            Nền tảng vận hành B2B ưu tiên web
          </p>
          <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">
            Điều phối chuyến cửa khẩu bằng sự kiện tin cậy, không chỉ bằng trạng thái rời rạc.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            GateSync phục vụ trước cho đội vận hành nội bộ: điều phối viên, nhân sự chứng từ, hiện
            trường, tài xế, phương tiện, chuyến đi, bãi, mốc cửa khẩu, thông báo và tích hợp được ủy
            quyền.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              className="rounded-full bg-slate-950 px-6 py-3 text-center text-sm font-semibold text-white shadow-soft transition hover:bg-slate-800"
              href="/dashboard"
            >
              Mở bảng điều phối
            </Link>
            <Link
              className="rounded-full border border-slate-200 bg-white/80 px-6 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
              href="/trips"
            >
              Xem chuyến đang chạy
            </Link>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
          <div className="grid grid-cols-2 gap-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:p-5"
              >
                <p className="text-sm text-slate-500">{stat.label}</p>
                <p className="mt-3 text-3xl font-bold text-slate-950 sm:text-4xl">{stat.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-3xl border border-slate-100 bg-slate-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Công việc hỗ trợ
            </p>
            <div className="mt-5 space-y-4">
              {highlights.map((highlight) => (
                <div key={highlight} className="flex gap-3">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <p className="text-sm leading-6 text-slate-700">{highlight}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
