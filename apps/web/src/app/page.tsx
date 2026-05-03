import Image from 'next/image';

const stats = [
  { label: 'Active trips', value: '128' },
  { label: 'Border delays', value: '14' },
  { label: 'Yard alerts', value: '7' },
  { label: 'Events today', value: '412' }
];

const milestones = [
  'Trip event timeline as source of operational history',
  'Tenant-isolated API access through NestJS',
  'Supabase Auth, PostgreSQL, Realtime, and Storage foundation',
  'Prisma schema aligned with GateSync domain modules'
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 sm:px-10 lg:px-12">
      <header className="flex items-center justify-between rounded-full border border-white/70 bg-white/75 px-5 py-3 shadow-soft backdrop-blur">
        <div className="flex items-center gap-3">
          <Image
            src="/gs-logo.png"
            alt="GateSync logo"
            width={40}
            height={40}
            priority
            className="h-10 w-10 rounded-full bg-slate-950 object-cover"
          />
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-600">
              GateSync
            </p>
            <p className="text-xs text-slate-500">Border logistics control tower</p>
          </div>
        </div>
        <span className="hidden rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700 sm:inline-flex">
          MVP foundation ready
        </span>
      </header>

      <section className="grid flex-1 items-center gap-10 py-16 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p className="mb-5 inline-flex rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700">
            Web-first B2B operations platform
          </p>
          <h1 className="max-w-4xl text-5xl font-bold tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">
            Coordinate border trips through trusted events, not fragile status updates.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            GateSync starts with internal logistics teams: dispatchers, document staff, field
            operators, drivers, vehicles, trips, yards, border-gate milestones, notifications, and
            integrations.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              className="rounded-full bg-slate-950 px-6 py-3 text-center text-sm font-semibold text-white shadow-soft transition hover:bg-slate-800"
              href="/dashboard"
            >
              Open dashboard
            </a>
            <a
              className="rounded-full border border-slate-200 bg-white/80 px-6 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
              href="/docs"
            >
              View setup docs
            </a>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/80 bg-white/80 p-5 shadow-soft backdrop-blur">
          <div className="grid grid-cols-2 gap-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
                <p className="text-sm text-slate-500">{stat.label}</p>
                <p className="mt-3 text-4xl font-bold text-slate-950">{stat.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-3xl bg-slate-950 p-6 text-white">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-300">
              Foundation scope
            </p>
            <div className="mt-5 space-y-4">
              {milestones.map((milestone) => (
                <div key={milestone} className="flex gap-3">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  <p className="text-sm leading-6 text-slate-200">{milestone}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
