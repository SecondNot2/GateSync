'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { hasOrganizationPermission, type NotificationRuleInput } from '@gatesync/shared';
import { AppShell } from '@/components/app-shell';
import { NoOrganizationState } from '@/components/no-organization-state';
import { StatePanel } from '@/components/ui';
import {
  createAdminNotificationRule,
  loadAdminNotificationRuleData,
  loadAdminNotificationRuleUserOptions,
  updateAdminNotificationRule
} from '@/lib/operations/data';
import { isOrganizationAccessError, type OrganizationAccessIssue } from '@/lib/operations/errors';
import type { ApiCurrentUser, ApiNotificationRule, ApiOrganization } from '@/lib/api/types';
import { toOrganizationContext } from '@/lib/operations/view-model';
import { RuleForm } from './rule-form';

type CreateState = {
  mode: 'create';
  organization: ApiOrganization;
  currentUser: ApiCurrentUser;
};

type EditState = {
  mode: 'edit';
  organization: ApiOrganization;
  currentUser: ApiCurrentUser;
  rule: ApiNotificationRule;
};

type EditorClientState = CreateState | EditState;

type NotificationRuleEditorClientProps = {
  initialData?: EditorClientState;
  initialError?: string;
  initialOrganizationIssue?: OrganizationAccessIssue;
};

const RULES_LIST_PATH = '/admin/notifications/rules';

export function NotificationRuleEditorClient({
  initialData,
  initialError,
  initialOrganizationIssue
}: NotificationRuleEditorClientProps = {}) {
  const router = useRouter();
  const [state, setState] = useState<EditorClientState | undefined>(initialData);
  const [error, setError] = useState<string | undefined>(initialError);
  const [organizationIssue, setOrganizationIssue] = useState<OrganizationAccessIssue | undefined>(
    initialOrganizationIssue
  );
  const [serverError, setServerError] = useState<string | undefined>();
  const [userOptions, setUserOptions] = useState<
    Array<{ userId: string; label: string; role: string }>
  >([]);
  const [userOptionsError, setUserOptionsError] = useState<string | undefined>();

  // We rely on the server-side initial load to populate state. There is no
  // useful client-only refetch path for the editor: the create page never
  // needs more than the active organization, and the edit page is hydrated
  // with the rule that the server resolved from the URL parameter.
  //
  // Surface the failure cleanly when SSR produced an error and the user
  // navigates client-side.
  useEffect(() => {
    if (state || initialError || initialOrganizationIssue) {
      return;
    }

    let mounted = true;

    async function fetchEdit(ruleId: string) {
      try {
        const result = await loadAdminNotificationRuleData(ruleId);
        if (mounted) {
          setState({ mode: 'edit', ...result });
        }
      } catch (loadError) {
        if (!mounted) return;
        if (isOrganizationAccessError(loadError)) {
          setOrganizationIssue(loadError.issue);
        }
        setError(
          loadError instanceof Error ? loadError.message : 'Không thể tải quy tắc thông báo.'
        );
      }
    }

    if (typeof window !== 'undefined') {
      const segments = window.location.pathname.split('/').filter(Boolean);
      const last = segments[segments.length - 1];
      if (last && last !== 'new' && last !== 'rules') {
        void fetchEdit(last);
      }
    }

    return () => {
      mounted = false;
    };
  }, [state, initialError, initialOrganizationIssue]);

  // Fetch the active organization's roster so the editor can render a real
  // user picker for `custom_user_list`. The fetch is lazy (only after we
  // have a confirmed organization) so the create/edit pages can still load
  // when memberships are temporarily unreachable.
  useEffect(() => {
    if (!state) {
      return;
    }
    let mounted = true;

    async function fetchUsers() {
      try {
        const result = await loadAdminNotificationRuleUserOptions();
        if (!mounted) return;
        setUserOptions(result.users);
        setUserOptionsError(undefined);
      } catch (loadError) {
        if (!mounted) return;
        setUserOptions([]);
        setUserOptionsError(
          loadError instanceof Error
            ? loadError.message
            : 'Không thể tải danh sách thành viên tổ chức.'
        );
      }
    }

    void fetchUsers();

    return () => {
      mounted = false;
    };
  }, [state]);

  const role = state?.organization.currentUserMembership.role;
  const canManage = role
    ? hasOrganizationPermission(role, 'memberships:manage') ||
      hasOrganizationPermission(role, 'organizations:update')
    : false;

  // Defense-in-depth: if the editor is loaded with a rule whose
  // organizationId differs from the active organization, refuse to render.
  // The API guards already block writes; this just prevents a confusing
  // surface where the form appears editable for the wrong tenant.
  const tenantMismatch =
    state?.mode === 'edit' && state.rule.organizationId !== state.organization.id;

  const initialValues = useMemo<Partial<NotificationRuleInput> | undefined>(() => {
    if (state?.mode !== 'edit') {
      return undefined;
    }
    const rule = state.rule;
    return {
      name: rule.name,
      eventType: rule.eventType as NotificationRuleInput['eventType'],
      channels: rule.channels as NotificationRuleInput['channels'],
      recipientScope: rule.recipientScope as NotificationRuleInput['recipientScope'],
      customUserIds: rule.customUserIds,
      mandatory: rule.mandatory,
      enabled: rule.enabled
    };
  }, [state]);

  async function handleSubmit(values: NotificationRuleInput) {
    if (!state) {
      return;
    }
    setServerError(undefined);
    try {
      if (state.mode === 'create') {
        await createAdminNotificationRule({
          ...values,
          organizationId: state.organization.id
        });
      } else {
        await updateAdminNotificationRule(state.rule.id, values);
      }
      router.push(RULES_LIST_PATH);
      router.refresh();
    } catch (submitError) {
      setServerError(
        submitError instanceof Error
          ? submitError.message
          : 'Không thể lưu quy tắc. Vui lòng kiểm tra dữ liệu và thử lại.'
      );
    }
  }

  function handleCancel() {
    router.push(RULES_LIST_PATH);
  }

  const shellOrganization = state
    ? toOrganizationContext(state.organization, state.currentUser)
    : undefined;
  const shellProps = shellOrganization ? { organization: shellOrganization } : {};

  return (
    <AppShell
      activeNav="admin"
      eyebrow="Quản trị thông báo"
      title={state?.mode === 'edit' ? 'Chỉnh sửa quy tắc thông báo' : 'Tạo quy tắc thông báo'}
      description="Cấu hình điều kiện kích hoạt thông báo, kênh phân phối và phạm vi người nhận. Máy chủ luôn là nguồn xác thực cuối cùng."
      {...shellProps}
      action={
        <Link
          href={RULES_LIST_PATH}
          className="inline-flex min-h-11 items-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
        >
          Quay lại danh sách
        </Link>
      }
    >
      {organizationIssue && error ? (
        <NoOrganizationState issue={organizationIssue} message={error} />
      ) : null}
      {!organizationIssue && error ? <StatePanel tone="error" message={error} /> : null}

      {state && !error ? (
        <section className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
          <header className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Tổ chức
            </p>
            <h2 className="text-xl font-bold text-slate-950 sm:text-2xl">
              {state.organization.name}
            </h2>
            {state.mode === 'edit' ? (
              <p className="text-sm text-slate-600">
                Đang chỉnh sửa quy tắc{' '}
                <span className="font-semibold text-slate-900">{state.rule.name}</span>.
              </p>
            ) : (
              <p className="text-sm text-slate-600">
                Tạo quy tắc mới cho tổ chức. Sau khi lưu, hệ thống sẽ áp dụng cho các sự kiện kế
                tiếp.
              </p>
            )}
          </header>

          {tenantMismatch ? (
            <StatePanel
              className="mt-4"
              tone="error"
              message="Quy tắc này không thuộc tổ chức đang hoạt động của bạn. Hãy chuyển sang tổ chức tương ứng để chỉnh sửa."
            />
          ) : !canManage ? (
            <StatePanel
              className="mt-4"
              tone="warning"
              message="Bạn không có quyền chỉnh sửa quy tắc thông báo. Vui lòng liên hệ quản trị viên tổ chức."
            />
          ) : null}

          <div className="mt-5">
            <RuleForm
              {...(initialValues ? { initialValues } : {})}
              disabled={tenantMismatch || !canManage}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              submitLabel={state.mode === 'edit' ? 'Cập nhật quy tắc' : 'Tạo quy tắc'}
              {...(serverError ? { serverError } : {})}
              userOptions={userOptions}
              {...(userOptionsError ? { userOptionsError } : {})}
            />
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
