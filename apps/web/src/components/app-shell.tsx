'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { NotificationCenter } from '@/components/notification-center';
import { SignOutButton } from '@/components/sign-out-button';
import type { OperationsOrganizationContext } from '@/lib/operations/view-model';
import { membershipRoleLabels, organizationTypeLabels } from '@/lib/ui-labels';

type AppNavKey = 'dashboard' | 'trips' | 'integrations' | 'settings' | 'admin';

type AppShellProps = {
  activeNav: AppNavKey;
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  organization?: OperationsOrganizationContext;
  unreadNotificationCount?: number;
  children: ReactNode;
};

type AppNavItem = {
  key: AppNavKey;
  label: string;
  shortLabel: string;
  href: string;
  badge?: string;
  children?: Array<{ label: string; href: string }>;
};

export function AppShell({
  activeNav,
  eyebrow,
  title,
  description,
  action,
  organization,
  unreadNotificationCount = 0,
  children
}: AppShellProps) {
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const currentOrganization = organization ?? {
    name: 'Tổ chức vận hành',
    type: 'LOGISTICS_COMPANY',
    controlScore: '--'
  };
  const currentUser = currentOrganization.currentUser;
  const tripsNavItem: AppNavItem = {
    key: 'trips',
    label: 'Quản lý chuyến',
    shortLabel: 'Chuyến',
    href: '/trips'
  };

  if (currentOrganization.tripBadge) {
    tripsNavItem.badge = currentOrganization.tripBadge;
  }

  const navItems: AppNavItem[] = [
    { key: 'dashboard', label: 'Bảng điều phối', shortLabel: 'Điều phối', href: '/dashboard' }
  ];

  if (currentUser?.canReadTrips !== false) {
    navItems.push(tripsNavItem);
  }

  if (currentUser?.canUseCuaKhauSoIntegration !== false) {
    navItems.push({
      key: 'settings',
      label: 'Cài đặt cấu hình',
      shortLabel: 'Cấu hình',
      href: '/settings/cua-khau-so',
      children: [{ label: 'Cửa khẩu số', href: '/settings/cua-khau-so' }]
    });
  }

  if (currentUser?.canOpenAdmin !== false) {
    navItems.push({
      key: 'admin',
      label: 'Quản trị nội bộ',
      shortLabel: 'Quản trị',
      href: '/admin'
    });
  }

  return (
    <main className="min-h-screen px-3 pb-24 pt-3 text-slate-950 sm:px-5 sm:pb-6 lg:px-6">
      <div
        className={`mx-auto grid max-w-[96rem] gap-3 transition-[grid-template-columns] duration-300 lg:gap-4 ${
          isSidebarCompact ? 'lg:grid-cols-[5.5rem_1fr]' : 'lg:grid-cols-[16rem_1fr]'
        }`}
      >
        <header className="sticky top-3 z-20 flex items-center justify-between rounded-3xl border border-slate-200 bg-white/95 px-3 py-2.5 shadow-soft backdrop-blur lg:hidden">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <Image
              src="/gs-logo.png"
              alt="Logo GateSync"
              width={40}
              height={40}
              priority
              className="h-9 w-9 rounded-full bg-white object-cover"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-950">GateSync</p>
              <p className="truncate text-xs text-slate-500">{currentOrganization.name}</p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <NotificationCenter userId={currentUser?.id} organizationId={currentOrganization.id} />
            <SessionMenu currentUser={currentUser} compact />
          </div>
        </header>

        <aside className="hidden overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white/95 p-3 shadow-soft backdrop-blur lg:sticky lg:top-3 lg:block lg:h-[calc(100vh-1.5rem)]">
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/dashboard"
              className={`flex min-w-0 items-center gap-3 rounded-3xl bg-white/10 p-2 ${
                isSidebarCompact ? 'justify-center' : ''
              }`}
            >
              <Image
                src="/gs-logo.png"
                alt="Logo GateSync"
                width={40}
                height={40}
                priority
                className="h-10 w-10 rounded-full bg-white object-cover"
              />
              {!isSidebarCompact ? (
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-950">GateSync</p>
                  <p className="truncate text-xs text-slate-500">Logistics cửa khẩu</p>
                </div>
              ) : null}
            </Link>
            {!isSidebarCompact ? (
              <button
                type="button"
                onClick={() => setIsSidebarCompact(true)}
                className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500 transition hover:border-sky-200 hover:text-sky-700"
              >
                Thu
              </button>
            ) : null}
          </div>

          {isSidebarCompact ? (
            <button
              type="button"
              onClick={() => setIsSidebarCompact(false)}
              className="mt-3 flex h-10 w-full items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 text-xs font-bold text-sky-700 transition hover:border-sky-200"
            >
              Mở
            </button>
          ) : (
            <details className="mt-3 rounded-3xl border border-slate-100 bg-slate-50 p-3">
              <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Tổ chức
              </summary>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                {currentOrganization.name}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {organizationTypeLabels[currentOrganization.type]}
              </p>
            </details>
          )}

          <nav className="mt-4 space-y-1.5">
            {navItems.map((item) => {
              const isActive = item.key === activeNav;

              return (
                <div key={item.key}>
                  <Link
                    href={item.href}
                    title={item.label}
                    className={`flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                      isActive
                        ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/10'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                    } ${isSidebarCompact ? 'justify-center px-2 text-center text-xs' : ''}`}
                  >
                    <span>{isSidebarCompact ? item.shortLabel : item.label}</span>
                    {item.badge && !isSidebarCompact ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          isActive ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                  {!isSidebarCompact && item.children && isActive ? (
                    <div className="mt-1 space-y-1 rounded-2xl bg-slate-50 p-1.5">
                      {item.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          className="flex min-h-9 items-center rounded-xl px-3 text-xs font-semibold text-sky-700 transition hover:bg-white"
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>

          {!isSidebarCompact ? (
            <details className="mt-4 rounded-3xl border border-slate-100 bg-slate-50 p-3 text-slate-950">
              <summary className="cursor-pointer list-none text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                Người dùng
              </summary>
              <p className="mt-2 truncate text-sm font-bold">
                {currentUser?.name ?? 'Đang xác thực'}
              </p>
              <p className="mt-1 truncate text-xs text-slate-500">
                {currentUser?.email ?? 'Phiên GateSync'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {currentUser ? (
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                    {membershipRoleLabels[currentUser.role]}
                  </span>
                ) : null}
                {currentUser && currentUser.activeOrganizationCount > 1 ? (
                  <Link
                    href="/onboarding"
                    className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:text-sky-700"
                  >
                    Đổi tổ chức
                  </Link>
                ) : null}
              </div>
            </details>
          ) : null}

          <div className="mt-4">
            <SignOutButton
              className={`w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-rose-200 hover:text-rose-600 ${
                isSidebarCompact ? 'text-xs' : ''
              }`}
            />
          </div>
        </aside>

        <section className="min-w-0 space-y-3 sm:space-y-4">
          <header className="sticky top-3 z-10 rounded-[1.5rem] border border-slate-200 bg-white/95 px-3 py-3 shadow-soft backdrop-blur sm:px-4 lg:top-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 sm:text-sm">
                  {eyebrow}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h1 className="truncate text-xl font-bold tracking-tight text-slate-950 sm:text-2xl xl:text-3xl">
                    {title}
                  </h1>
                  <span className="hidden rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-100 md:inline-flex">
                    {currentUser ? membershipRoleLabels[currentUser.role] : 'Đang xác thực'}
                  </span>
                </div>
                <details className="mt-1 max-w-3xl text-sm text-slate-600">
                  <summary className="cursor-pointer list-none text-xs font-semibold text-slate-400 transition hover:text-slate-600">
                    Mô tả ngắn
                  </summary>
                  <p className="mt-1 leading-6">{description}</p>
                </details>
              </div>
              <div className="flex flex-wrap gap-2 lg:flex-shrink-0">
                <NotificationCenter
                  userId={currentUser?.id}
                  organizationId={currentOrganization.id}
                />
                <SessionMenu currentUser={currentUser} />
                {action}
              </div>
            </div>
          </header>

          {children}
        </section>
      </div>
      <nav className="fixed inset-x-3 bottom-3 z-30 flex items-end gap-1 rounded-3xl border border-slate-200 bg-white/95 p-1.5 shadow-soft backdrop-blur lg:hidden">
        <BottomTab
          href="/dashboard"
          label="Tổng quan"
          active={activeNav === 'dashboard'}
          icon={<DashboardIcon />}
        />
        <BottomTab
          href="/trips"
          label="Chuyến xe"
          active={activeNav === 'trips'}
          icon={<TruckIcon />}
          {...(currentOrganization.tripBadge ? { badge: currentOrganization.tripBadge } : {})}
        />
        <Link
          href="/scan"
          className="relative -mt-2 flex h-14 w-14 flex-col items-center justify-center rounded-full bg-slate-950 text-white shadow-lg shadow-slate-950/20 transition hover:bg-slate-800"
        >
          <QrScanIcon />
          <span className="mt-0.5 text-[0.6rem] font-bold">Quét</span>
        </Link>
        <BottomTab
          href="/alerts"
          label="Cảnh báo"
          active={false}
          icon={<BellIcon />}
          {...(unreadNotificationCount > 0 ? { badge: String(unreadNotificationCount > 9 ? '9+' : unreadNotificationCount) } : {})}
        />
        <BottomTab
          href="/settings"
          label="Tài khoản"
          active={activeNav === 'settings'}
          icon={<UserIcon />}
        />
      </nav>
    </main>
  );
}

function BottomTab({
  href,
  label,
  active,
  icon,
  badge
}: {
  href: string;
  label: string;
  active: boolean;
  icon: ReactNode;
  badge?: string | undefined;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-2xl px-1 py-1.5 text-center transition ${
        active ? 'text-slate-950' : 'text-slate-400 hover:text-slate-600'
      }`}
    >
      <span className="relative">
        {icon}
        {badge ? (
          <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[0.55rem] font-bold text-white">
            {badge}
          </span>
        ) : null}
      </span>
      {active ? (
        <span className="mt-0.5 text-[0.62rem] font-bold">{label}</span>
      ) : null}
    </Link>
  );
}

function DashboardIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h1" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="19" cy="18" r="2" />
    </svg>
  );
}

function QrScanIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <rect x="7" y="7" width="4" height="4" />
      <rect x="13" y="7" width="4" height="4" />
      <rect x="7" y="13" width="4" height="4" />
      <path d="M13 13h4v4h-4z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 1 0-16 0" />
    </svg>
  );
}

function SessionMenu({
  currentUser,
  compact = false
}: {
  currentUser: OperationsOrganizationContext['currentUser'];
  compact?: boolean;
}) {
  return (
    <details className="relative">
      <summary
        className={`flex cursor-pointer list-none items-center justify-center rounded-2xl border border-slate-200 bg-white text-center text-sm font-semibold text-slate-700 shadow-soft transition hover:border-sky-300 hover:text-sky-700 ${
          compact ? 'min-h-10 px-3 py-2' : 'min-h-11 px-4 py-2.5'
        }`}
      >
        {currentUser ? membershipRoleLabels[currentUser.role] : 'Phiên'}
      </summary>
      <div
        className={`absolute right-0 top-[calc(100%+0.5rem)] z-40 w-64 rounded-3xl border border-slate-200 bg-white p-3 text-left shadow-2xl shadow-slate-950/10 ${
          compact ? 'w-56' : ''
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          Phiên GateSync
        </p>
        <p className="mt-2 truncate text-sm font-bold text-slate-950">
          {currentUser?.name ?? 'Đang xác thực'}
        </p>
        <p className="mt-1 truncate text-xs text-slate-500">
          {currentUser?.email ?? 'Đang kiểm tra phiên'}
        </p>
        {currentUser && currentUser.activeOrganizationCount > 1 ? (
          <Link
            href="/onboarding"
            className="mt-3 flex rounded-2xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:text-sky-700"
          >
            Đổi tổ chức
          </Link>
        ) : null}
        <SignOutButton className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-rose-200 hover:text-rose-600" />
      </div>
    </details>
  );
}
