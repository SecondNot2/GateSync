import { notFound } from 'next/navigation';
import { resolveServerApiSession } from '@/lib/api/server-session';
import { gatesyncApi } from '@/lib/api/gatesync';
import { ApiClientError } from '@/lib/api/client';
import { resolveInitialLoad } from '@/lib/operations/initial-load';
import { OrganizationAccessError } from '@/lib/operations/errors';
import { NotificationRuleEditorClient } from '../rule-editor-client';

type EditPageProps = {
  params: Promise<{ ruleId: string }>;
};

/**
 * Server entry for `/admin/notifications/rules/[ruleId]`.
 *
 * Loads the rule and the active organization in parallel so the client can
 * cross-check that the rule belongs to the same organization the editor is
 * operating in (defense-in-depth — the API guard is authoritative). When the
 * rule is missing we surface Next.js' built-in `notFound` UI rather than the
 * generic error panel.
 */
export default async function EditNotificationRulePage({ params }: EditPageProps) {
  const { ruleId } = await params;

  const initialState = await resolveInitialLoad(async () => {
    const session = await resolveServerApiSession();

    if (session.mode === 'dev') {
      throw new Error(
        'Chế độ dữ liệu mẫu chưa hỗ trợ chỉnh sửa quy tắc thông báo. Hãy cấu hình Supabase/API để truy cập dữ liệu thật.'
      );
    }

    const [currentUser, organizations] = await Promise.all([
      gatesyncApi.getMe({ accessToken: session.accessToken }),
      gatesyncApi.listOrganizations({ accessToken: session.accessToken })
    ]);
    const activeOrganization = organizations.find(
      (organization) => organization.currentUserMembership.status === 'ACTIVE'
    );

    if (!activeOrganization) {
      throw new OrganizationAccessError(
        'NO_ORGANIZATION',
        'Tài khoản của bạn chưa thuộc tổ chức đang hoạt động nào trong GateSync.'
      );
    }

    try {
      const rule = await gatesyncApi.getNotificationRule(ruleId, {
        accessToken: session.accessToken
      });

      return {
        mode: 'edit' as const,
        organization: activeOrganization,
        currentUser,
        rule
      };
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) {
        notFound();
      }
      throw error;
    }
  });

  return <NotificationRuleEditorClient {...initialState} />;
}
