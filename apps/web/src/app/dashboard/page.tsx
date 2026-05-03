const queueItems = [
  { code: 'GS-EXP-1024', vehicle: '29H-456.78', status: 'IN_YARD', gate: 'Huu Nghi' },
  { code: 'GS-IMP-2048', vehicle: '12C-888.21', status: 'CUSTOMS_PROCESSING', gate: 'Tan Thanh' },
  { code: 'GS-YARD-3310', vehicle: '98R-112.45', status: 'WAITING_YARD_ENTRY', gate: 'Chi Ma' }
];

export default function DashboardPage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10 sm:px-10 lg:px-12">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-600">Operations</p>
        <h1 className="mt-3 text-4xl font-bold text-slate-950">GateSync dashboard foundation</h1>
        <p className="mt-4 max-w-3xl text-slate-600">
          This placeholder is ready for authenticated, tenant-scoped dashboards once organization,
          membership, trip, and trip event APIs are implemented.
        </p>
      </div>

      <section className="rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-soft backdrop-blur">
        <div className="grid gap-4">
          {queueItems.map((item) => (
            <div
              key={item.code}
              className="grid gap-3 rounded-3xl border border-slate-100 bg-slate-50 p-5 sm:grid-cols-4 sm:items-center"
            >
              <p className="font-semibold text-slate-950">{item.code}</p>
              <p className="text-slate-600">{item.vehicle}</p>
              <p className="text-slate-600">{item.gate}</p>
              <span className="rounded-full bg-sky-100 px-3 py-1 text-center text-sm font-semibold text-sky-700">
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
