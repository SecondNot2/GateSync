import { ApiClientError } from '@/lib/api/client';
import { gatesyncApi } from '@/lib/api/gatesync';
import { resolveServerApiSession } from '@/lib/api/server-session';
import { resolveInitialLoad } from '@/lib/operations/initial-load';
import { OrganizationAccessError } from '@/lib/operations/errors';
import type {
  ApiCurrentUser,
  ApiNotificationPreference,
  ApiNotificationRule,
  ApiOrganization
} from '@/lib/api/types';
import { NotificationPreferencesClient } from './notification-preferences-client';

/**
 * Server entry for `/me/notification-preferences`.
 *
 * Loads three resources for the active organization in parallel so the
 * client renders without an extra round-trip:
 *
 * - `GET /api/v1/me/notification-preferences?organizationId=...` returns the
 *   user's saved preferences (self-only — `userId` is taken from the JWT).
 * - `GET /api/v1/notification-rules?organizationId=...` returns the org's
 *   `NotificationRule`s so the form can lock `(eventType, channel)` rows
 *   marked `mandatory = true` (Requirement 10.3). The endpoint is
 *   admin-only; non-admin callers receive an empty list and the form
 *   simply renders no locked rows.
 *
 * Validates: Requirements 10.1, 10.2, 10.3.
 */
export default async function NotificationPreferencesPage() {
  const initialState = await resolveInitialLoad(async () => {
    const session = await resolveServerApiSession();

    if (session.mode === 'dev') {
      throw new Error(
        'Chế độ dữ liệu mẫu chưa hỗ trợ tùy chọn thông báo. Hãy cấu hình Supabase/API để truy cập dữ liệu thật.'
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

    const preferences = await gatesyncApi.listMyNotificationPreferences(activeOrganization.id, {
      accessToken: session.accessToken
    });

    // Try fetching rules to surface mandatory locks. The endpoint is
    // admin-only; non-admin members receive 403, which we treat as "no
    // mandatory metadata available" rather than failing the page.
    let rules: ApiNotificationRule[] = [];
    try {
      rules = await gatesyncApi.listNotificationRules(activeOrganization.id, {
        accessToken: session.accessToken
      });
    } catch (loadError) {
      if (!(loadError instanceof ApiClientError) || loadError.status !== 403) {
        throw loadError;
      }
    }

    return {
      organization: activeOrganization,
      currentUser,
      preferences,
      rules
    } satisfies {
      organization: ApiOrganization;
      currentUser: ApiCurrentUser;
      preferences: ApiNotificationPreference[];
      rules: ApiNotificationRule[];
    };
  });

  return <NotificationPreferencesClient {...initialState} />;
}
