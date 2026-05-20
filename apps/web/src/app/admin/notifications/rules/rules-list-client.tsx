'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { NoOrganizationState } from '@/components/no-organization-state';
import { Button, StatePanel } from '@/components/ui';
import { deleteAdminNotificationRule, loadAdminNotificationRulesData } from '@/lib/operations/data';
import { isOrganizationAccessError, type OrganizationAccessIssue } from '@/lib/operations/errors';
import type { ApiCurrentUser, ApiNotificationRule, ApiOrganization } from '@/lib/api/types';
import { hasOrganizationPermission } from '@gatesync/shared';
import { toOrganizationContext } from '@/lib/operations/view-model';
import {
  notificationChannelLabels,
  notificationEventTypeLabels,
  notificationRecipientScopeLabels
} from './labels';

type ListData = {
  organization: ApiOrganization;
  currentUser: ApiCurrentUser;
  rules: ApiNotificationRule[];
};

type NotificationRulesListClientProps = {
  initialData?: ListData;
  initialError?: string;
  initialOrganizationIssue?: OrganizationAccessIssue;
};

export function NotificationRulesListClient({
  initialData,
  initialError,
  initialOrganizationIssue
}: NotificationRulesListClientProps = {}) {
  const hasInitialState = Boolean(initialData || initialError || initialOrganizationIssue);
  const [data, setData] = useState<ListData | undefined>(initialData);
  const [error, setError] = useState<string | undefined>(initialError);
  const [organizationIssue, setOrganizationIssue] = useState<OrganizationAccessIssue | undefined>(
    initialOrganizationIssue
  );
  const [isLoading, setIsLoading] = useState(!hasInitialState);
  const [message, setMessage] = useState<string>();
  const [pendingId, setPendingId] = useState<string>();
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  useEffect(() => {
    if (hasInitialState) {
      return;
    }

    let mounted = true;

    async function fetchData() {
      setIsLoading(true);
      setError(undefined);
      setOrganizationIssue(undefined);
      try {
        const result = await loadAdminNotificationRulesData();
        if (mounted) {
          setData(result);
        }
      } catch (loadError) {
        if (mounted) {
          if (isOrganizationAccessError(loadError)) {
            setOrganizationIssue(loadError.issue);
          }
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Không thể tải danh sách quy tắc thông báo.'
          );
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void fetchData();

    return () => {
      mounted = false;
    };
  }, [hasInitialState]);

  async function reload() {
    setMessage(undefined);
    setError(undefined);
    try {
      const result = await loadAdminNotificationRulesData();
      setData(result);
    } catch (loadError) {
      if (isOrganizationAccessError(loadError)) {
        setOrganizationIssue(loadError.issue);
      }
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Không thể tải danh sách quy tắc thông báo.'
      );
    }
  }

  async function handleDelete(rule: ApiNotificationRule) {
    if (
      !window.confirm(`Xóa quy tắc "${rule.name}"? Hành động này không thể hoàn tác từ giao diện.`)
    ) {
      return;
    }
    setPendingId(rule.id);
    setMessage(undefined);
    try {
      await deleteAdminNotificationRule(rule.id);
      setMessage(`Đã xóa quy tắc "${rule.name}".`);
      await reload();
    } catch (deleteError) {
      setMessage(
        deleteError instanceof Error
          ? deleteError.message
          : 'Không thể xóa quy tắc. Vui lòng thử lại.'
      );
    } finally {
      setPendingId(undefined);
    }
  }

  const organization = data?.organization;
  const currentUser = data?.currentUser;
  const role = organization?.currentUserMembership.role;
  const canManage = role
    ? hasOrganizationPermission(role, 'memberships:manage') ||
      hasOrganizationPermission(role, 'organizations:update')
    : false;

  const totalRules = data?.rules.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRules / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageRules = useMemo(() => {
    if (!data) return [];
    const start = (safePage - 1) * pageSize;
    return data.rules.slice(start, start + pageSize);
  }, [data, safePage, pageSize]);

  // Clamp the active page when the rule list shrinks (e.g. after a delete)
  // so admins never get stuck on an empty page.
  useEffect(() => {
    if (page !== safePage) {
      setPage(safePage);
    }
  }, [page, safePage]);

  const shellOrganization =
    organization && currentUser ? toOrganizationContext(organization, currentUser) : undefined;
  const shellProps = shellOrganization ? { organization: shellOrganization } : {};

  return (
    <AppShell
      activeNav="admin"
      eyebrow="Quản trị thông báo"
      title="Quy tắc thông báo"
      description="Cấu hình quy tắc thông báo theo loại sự kiện, kênh phân phối và phạm vi người nhận. API tổ chức luôn xác thực lại trước khi ghi nhận."
      {...shellProps}
      action={
        canManage ? (
          <Link
            href="/admin/notifications/rules/new"
            className="inline-flex min-h-11 items-center rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-slate-800"
          >
            Thêm quy tắc mới
          </Link>
        ) : null
      }
    >
      {isLoading ? <StatePanel tone="loading" message="Đang tải quy tắc thông báo..." /> : null}
      {!isLoading && organizationIssue && error ? (
        <NoOrganizationState issue={organizationIssue} message={error} />
      ) : null}
      {!isLoading && !organizationIssue && error ? (
        <StatePanel tone="error" message={error} />
      ) : null}
      {message ? <StatePanel tone="info" message={message} /> : null}

      {!isLoading && !error && data ? (
        <section className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
          <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Tổ chức
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-950 sm:text-2xl">
                {data.organization.name}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {data.rules.length} quy tắc đang lưu trữ. Quy tắc đã xóa không hiển thị tại đây —
                kiểm tra audit log nếu cần truy vết.
              </p>
            </div>
            {!canManage ? (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                Bạn không có quyền chỉnh sửa quy tắc.
              </span>
            ) : null}
          </header>

          {data.rules.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
              <p>Tổ chức chưa có quy tắc thông báo nào.</p>
              {canManage ? (
                <Link
                  href="/admin/notifications/rules/new"
                  className="mt-4 inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
                >
                  Tạo quy tắc đầu tiên
                </Link>
              ) : null}
            </div>
          ) : (
            <>
              <ul className="mt-6 space-y-3">
                {pageRules.map((rule) => (
                  <li
                    key={rule.id}
                    className="rounded-3xl border border-slate-100 bg-slate-50 p-4 sm:p-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-950">{rule.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Sự kiện:{' '}
                          <span className="font-semibold text-slate-700">
                            {labelForEventType(rule.eventType)}
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Phạm vi người nhận:{' '}
                          <span className="font-semibold text-slate-700">
                            {labelForRecipientScope(rule.recipientScope)}
                          </span>
                          {rule.recipientScope === 'custom_user_list'
                            ? ` · ${rule.customUserIds.length} người dùng`
                            : ''}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Kênh phân phối:{' '}
                          <span className="font-semibold text-slate-700">
                            {rule.channels.length === 0
                              ? 'Không có'
                              : rule.channels.map((channel) => labelForChannel(channel)).join(', ')}
                          </span>
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge enabled={rule.enabled} mandatory={rule.mandatory} />
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={`/admin/notifications/rules/${rule.id}`}
                        className="inline-flex min-h-10 items-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
                      >
                        {canManage ? 'Chỉnh sửa' : 'Xem chi tiết'}
                      </Link>
                      {canManage ? (
                        <Button
                          variant="danger"
                          type="button"
                          disabled={pendingId === rule.id}
                          onClick={() => void handleDelete(rule)}
                        >
                          {pendingId === rule.id ? 'Đang xóa...' : 'Xóa quy tắc'}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
              <PaginationControls
                page={safePage}
                pageSize={pageSize}
                total={totalRules}
                totalPages={totalPages}
                onPageChange={setPage}
                onPageSizeChange={(next) => {
                  setPageSize(next);
                  setPage(1);
                }}
              />
            </>
          )}
        </section>
      ) : null}
    </AppShell>
  );
}

function StatusBadge({ enabled, mandatory }: { enabled: boolean; mandatory: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span
        className={`rounded-full px-3 py-1 text-xs font-semibold ${
          enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {enabled ? 'Đang bật' : 'Đang tắt'}
      </span>
      {mandatory ? (
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
          Bắt buộc
        </span>
      ) : null}
    </div>
  );
}

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

function PaginationControls({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (next: number) => void;
  onPageSizeChange: (next: number) => void;
}) {
  if (total === 0) {
    return null;
  }
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
      <p>
        Hiển thị <span className="font-semibold text-slate-900">{start}</span>–
        <span className="font-semibold text-slate-900">{end}</span> trong tổng{' '}
        <span className="font-semibold text-slate-900">{total}</span> quy tắc.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <span>Số dòng / trang</span>
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="min-h-10 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ← Trước
          </button>
          <span className="text-xs font-semibold text-slate-700">
            Trang {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="min-h-10 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Sau →
          </button>
        </div>
      </div>
    </div>
  );
}

function labelForEventType(value: string): string {
  if (value in notificationEventTypeLabels) {
    return notificationEventTypeLabels[value as keyof typeof notificationEventTypeLabels];
  }
  return value;
}

function labelForRecipientScope(value: string): string {
  if (value in notificationRecipientScopeLabels) {
    return notificationRecipientScopeLabels[value as keyof typeof notificationRecipientScopeLabels];
  }
  return value;
}

function labelForChannel(value: string): string {
  if (value in notificationChannelLabels) {
    return notificationChannelLabels[value as keyof typeof notificationChannelLabels];
  }
  return value;
}
