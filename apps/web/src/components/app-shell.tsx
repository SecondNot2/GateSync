import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SignOutButton } from '@/components/sign-out-button';
import type { OperationsOrganizationContext } from '@/lib/operations/view-model';
import { organizationTypeLabels } from '@/lib/ui-labels';

type AppNavKey = 'dashboard' | 'trips' | 'integrations' | 'admin';

type AppShellProps = {
  activeNav: AppNavKey;
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  organization?: OperationsOrganizationContext;
  children: ReactNode;
};

export function AppShell({
  activeNav,
  eyebrow,
  title,
  description,
  action,
  organization,
  children
}: AppShellProps) {
  const currentOrganization = organization ?? {
    name: 'Tổ chức vận hành',
    type: 'LOGISTICS_COMPANY',
    controlScore: '--'
  };
  const tripsNavItem: { key: AppNavKey; label: string; href: string; badge?: string } = {
    key: 'trips',
    label: 'Quản lý chuyến',
    href: '/trips'
  };

  if (currentOrganization.tripBadge) {
    tripsNavItem.badge = currentOrganization.tripBadge;
  }

  const navItems: Array<{ key: AppNavKey; label: string; href: string; badge?: string }> = [
    { key: 'dashboard', label: 'Bảng điều phối', href: '/dashboard' },
    tripsNavItem,
    { key: 'integrations', label: 'Tích hợp dữ liệu', href: '/integrations/cua-khau-so' },
    { key: 'admin', label: 'Quản trị nội bộ', href: '/admin' }
  ];

  return (
    <main className="min-h-screen px-3 pb-24 pt-3 text-slate-950 sm:px-6 sm:pb-6 lg:px-8">
      <div className="mx-auto grid max-w-[90rem] gap-4 lg:grid-cols-[17rem_1fr]">
        <header className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white/95 px-4 py-3 shadow-soft backdrop-blur lg:hidden">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <Image
              src="/gs-logo.png"
              alt="Logo GateSync"
              width={40}
              height={40}
              priority
              className="h-10 w-10 rounded-full bg-white object-cover"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-950">GateSync</p>
              <p className="truncate text-xs text-slate-500">{currentOrganization.name}</p>
            </div>
          </Link>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-right">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-emerald-700">
              Kiểm soát
            </p>
            <p className="text-sm font-bold text-emerald-700">{currentOrganization.controlScore}</p>
          </div>
        </header>

        <aside className="hidden rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft backdrop-blur lg:sticky lg:top-4 lg:block lg:h-[calc(100vh-2rem)]">
          <Link href="/dashboard" className="flex items-center gap-3 rounded-3xl bg-white/10 p-3">
            <Image
              src="/gs-logo.png"
              alt="Logo GateSync"
              width={44}
              height={44}
              priority
              className="h-11 w-11 rounded-full bg-white object-cover"
            />
            <div>
              <p className="text-sm font-bold text-slate-950">GateSync</p>
              <p className="text-xs text-slate-500">Điều phối logistics cửa khẩu</p>
            </div>
          </Link>

          <div className="mt-5 rounded-3xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Tổ chức
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-950">{currentOrganization.name}</p>
            <p className="mt-1 text-xs text-slate-500">
              {organizationTypeLabels[currentOrganization.type]}
            </p>
          </div>

          <nav className="mt-5 space-y-2">
            {navItems.map((item) => {
              const isActive = item.key === activeNav;

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/10'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.badge ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        isActive ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="mt-5 rounded-3xl border border-amber-100 bg-amber-50 p-4 text-slate-950">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">
              Ca trực hôm nay
            </p>
            <p className="mt-2 text-xl font-bold">16:00 - 22:00</p>
            <p className="mt-2 text-sm text-slate-700">
              7 cảnh báo mới cần điều phối viên xác nhận.
            </p>
          </div>

          <div className="mt-5">
            <SignOutButton className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-rose-200 hover:text-rose-600" />
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          <header className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft backdrop-blur sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 sm:text-sm">
                  {eyebrow}
                </p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                  {title}
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:flex-shrink-0">
                <div className="hidden rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 sm:block">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Điểm kiểm soát
                  </p>
                  <p className="mt-1 text-2xl font-bold text-emerald-600">
                    {currentOrganization.controlScore}
                  </p>
                </div>
                <SignOutButton className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-600 shadow-soft transition hover:border-rose-200 hover:text-rose-600" />
                {action}
              </div>
            </div>
          </header>

          {children}
        </section>
      </div>
      <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-4 gap-2 rounded-3xl border border-slate-200 bg-white/95 p-2 shadow-soft backdrop-blur lg:hidden">
        {navItems.map((item) => {
          const isActive = item.key === activeNav;

          return (
            <Link
              key={item.key}
              href={item.href}
              className={`flex min-h-12 flex-col items-center justify-center rounded-2xl px-2 py-2 text-center text-xs font-semibold transition ${
                isActive ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{item.label}</span>
              {item.badge ? (
                <span
                  className={`mt-1 text-[0.65rem] ${isActive ? 'text-slate-200' : 'text-slate-400'}`}
                >
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </main>
  );
}
