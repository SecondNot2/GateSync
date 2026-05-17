import { resolveServerApiSession } from '@/lib/api/server-session';
import { gatesyncApi } from '@/lib/api/gatesync';
import { resolveInitialLoad } from '@/lib/operations/initial-load';
import { OrganizationAccessError } from '@/lib/operations/errors';
import { NotificationRuleEditorClient } from '../rule-editor-client';

/**
 * Server entry for `/admin/notifications/rules/new`.
 *
 * Resolves the active organization on the server so the editor never has to
 * guess the tenant — the create call always carries `organizationId` in its
 * body, matching the contract enforced by `NotificationRulesController`.
 */
export default async function NewNotificationRulePage() {
  const initialState = await resolveInitialLoad(async () => {
    const session = await resolveServerApiSession();

    if (session.mode === 'dev') {
      throw new Error(
        'Chế độ dữ liệu mẫu chưa hỗ trợ tạo quy tắc thông báo. Hãy cấu hình Supabase/API để truy cập dữ liệu thật.'
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

    return {
      mode: 'create' as const,
      organization: activeOrganization,
      currentUser
    };
  });

  return <NotificationRuleEditorClient {...initialState} />;
}
