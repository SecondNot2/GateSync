import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-10">
      <section className="rounded-[2rem] border border-white/75 bg-white/85 p-8 text-center shadow-soft backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-600">Không tìm thấy</p>
        <h1 className="mt-4 text-4xl font-bold text-slate-950">Trang hoặc chuyến bạn yêu cầu không tồn tại</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Vui lòng quay lại danh sách chuyến hoặc bảng điều phối để tiếp tục theo dõi vận hành.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/trips"
            className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Về danh sách chuyến
          </Link>
          <Link
            href="/dashboard"
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
          >
            Mở bảng điều phối
          </Link>
        </div>
      </section>
    </main>
  );
}
