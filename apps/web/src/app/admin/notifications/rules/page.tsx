import { resolveServerApiSession } from '@/lib/api/server-session';
import { gatesyncApi } from '@/lib/api/gatesync';
import { resolveInitialLoad } from '@/lib/operations/initial-load';
import { OrganizationAccessError } from '@/lib/operations/errors';
import type { ApiNotificationRule } from '@/lib/api/types';
import { NotificationRulesListClient } from './rules-list-client';

/**
 * Server entry for `/admin/notifications/rules`.
 *
 * Mirrors the existing `/admin` page pattern: resolve the session on the
 * server, fetch the rule list once, and hydrate the client. When the user
 * has no active organization or the API rejects the call we surface the same
 * `NoOrganizationState` / error UX that the rest of admin already uses.
 */
export default async function AdminNotificationRulesPage() {
  const initialState = await resolveInitialLoad(async () => {
    const session = await resolveServerApiSession();

    if (session.mode === 'dev') {
      // Dev fallback mode is read-only and not wired for notification rules
      // yet; surface a friendly error instead of crashing.
      throw new Error(
        'Chế độ dữ liệu mẫu chưa hỗ trợ quy tắc thông báo. Hãy cấu hình Supabase/API để truy cập dữ liệu thật.'
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

    const rules = await gatesyncApi.listNotificationRules(activeOrganization.id, {
      accessToken: session.accessToken
    });

    return {
      organization: activeOrganization,
      currentUser,
      rules
    } satisfies {
      organization: typeof activeOrganization;
      currentUser: typeof currentUser;
      rules: ApiNotificationRule[];
    };
  });

  return <NotificationRulesListClient {...initialState} />;
}
