import { apiClient } from '@/lib/api/client';
import type {
  ApiCurrentUser,
  ApiCuaKhauSoSyncRunResult,
  ApiDriverProfile,
  ApiDriverTripMediaResult,
  ApiCuaKhauSoDeclarationDetail,
  ApiCuaKhauSoDeclarationList,
  ApiCuaKhauSoHealth,
  ApiCuaKhauSoSession,
  ApiCuaKhauSoSyncResult,
  ApiDashboardSummary,
  ApiIntegrationSyncRun,
  ApiIntegrationSyncRunsPage,
  ApiMembership,
  ApiMembershipInvitation,
  ApiNotification,
  ApiNotificationListPage,
  ApiNotificationPreference,
  ApiNotificationRule,
  ApiOrganization,
  ApiTripDetail,
  ApiTripEvent,
  ApiTripSummary,
  ApiVehicle,
  AcceptMembershipInvitationPayload,
  CreateOrganizationPayload,
  CreateDriverPayload,
  CreateDriverTripMediaPayload,
  CuaKhauSoLoginPayload,
  CreateTripEventPayload,
  CreateVehiclePayload,
  InviteMembershipPayload,
  ListCuaKhauSoDeclarationsParams,
  ListIntegrationSyncRunsParams,
  ListNotificationsParams,
  ListTripsParams,
  SyncCuaKhauSoDeclarationPayload,
  UpdateDriverPayload,
  UpdateMembershipPayload,
  UpdateVehiclePayload,
  UpsertNotificationPreferencesPayload
} from '@/lib/api/types';

type AuthenticatedOptions = {
  accessToken: string;
};

function buildQuery(params: ListTripsParams = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      searchParams.set(key, String(value));
    }
  });

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

function buildCuaKhauSoQuery(params: ListCuaKhauSoDeclarationsParams = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      searchParams.set(key, String(value));
    }
  });

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

export const gatesyncApi = {
  getMe: ({ accessToken }: AuthenticatedOptions) =>
    apiClient.get<ApiCurrentUser>('/me', { accessToken }),

  listNotifications: (options: AuthenticatedOptions & { after?: string }) => {
    const params = options.after ? `?after=${encodeURIComponent(options.after)}` : '';
    return apiClient.get<ApiNotification[]>(`/notifications${params}`, {
      accessToken: options.accessToken
    });
  },

  /**
   * Cursor-paginated `GET /api/v1/notifications`.
   *
   * Returns `{ data, nextCursor }` per the v1 contract. Pass `nextCursor` from
   * a previous page back as `params.cursor` to load the next page. Used by
   * `NotificationCenter` for TanStack Query infinite scroll.
   */
  listNotificationsPage: (options: AuthenticatedOptions & { params?: ListNotificationsParams }) => {
    const searchParams = new URLSearchParams();
    const params = options.params ?? {};

    if (params.cursor) {
      searchParams.set('cursor', params.cursor);
    }
    if (params.limit !== undefined) {
      searchParams.set('limit', String(params.limit));
    }
    if (params.channel) {
      searchParams.set('channel', params.channel);
    }
    if (params.status) {
      searchParams.set('status', params.status);
    }
    if (params.eventType) {
      searchParams.set('eventType', params.eventType);
    }
    if (params.after) {
      searchParams.set('after', params.after);
    }

    const query = searchParams.toString();

    return apiClient.get<ApiNotificationListPage>(`/notifications${query ? `?${query}` : ''}`, {
      accessToken: options.accessToken
    });
  },

  markNotificationRead: (notificationId: string, { accessToken }: AuthenticatedOptions) =>
    apiClient.patch<ApiNotification>(`/notifications/${notificationId}/read`, {}, { accessToken }),

  /**
   * Lifecycle endpoint: `POST /api/v1/notifications/:id/read` (self-only).
   *
   * Per task 12.2 spec wording, the canonical mark-read action uses POST.
   * The legacy `PATCH .../read` route remains for backwards compatibility
   * but new UI code should call this method.
   */
  markNotificationReadV2: (notificationId: string, { accessToken }: AuthenticatedOptions) =>
    apiClient.post<ApiNotification>(`/notifications/${notificationId}/read`, {}, { accessToken }),

  /**
   * Lifecycle endpoint: `POST /api/v1/notifications/:id/hide` (self-only).
   *
   * Removes the notification from the user's inbox without deleting the row.
   */
  hideNotification: (notificationId: string, { accessToken }: AuthenticatedOptions) =>
    apiClient.post<ApiNotification>(`/notifications/${notificationId}/hide`, {}, { accessToken }),

  markAllNotificationsRead: ({ accessToken }: AuthenticatedOptions) =>
    apiClient.patch<{ count: number }>('/notifications/read-all', {}, { accessToken }),

  clearNotifications: ({ accessToken }: AuthenticatedOptions) =>
    apiClient.delete<{ count: number }>('/notifications', { accessToken }),

  listOrganizations: ({ accessToken }: AuthenticatedOptions) =>
    apiClient.get<ApiOrganization[]>('/organizations', { accessToken }),

  createOrganization: (payload: CreateOrganizationPayload, { accessToken }: AuthenticatedOptions) =>
    apiClient.post<ApiOrganization>('/organizations', payload, { accessToken }),

  listMemberships: (organizationId: string, { accessToken }: AuthenticatedOptions) =>
    apiClient.get<ApiMembership[]>(`/organizations/${organizationId}/memberships`, {
      accessToken
    }),

  createMembershipInvitation: (
    organizationId: string,
    payload: InviteMembershipPayload,
    { accessToken }: AuthenticatedOptions
  ) =>
    apiClient.post<ApiMembershipInvitation>(
      `/organizations/${organizationId}/memberships/invitations`,
      payload,
      { accessToken }
    ),

  acceptMembershipInvitation: (
    payload: AcceptMembershipInvitationPayload,
    { accessToken }: AuthenticatedOptions
  ) => apiClient.post<ApiMembership>('/membership-invitations/accept', payload, { accessToken }),

  updateMembership: (
    organizationId: string,
    membershipId: string,
    payload: UpdateMembershipPayload,
    { accessToken }: AuthenticatedOptions
  ) =>
    apiClient.patch<ApiMembership>(
      `/organizations/${organizationId}/memberships/${membershipId}`,
      payload,
      {
        accessToken
      }
    ),

  getCuaKhauSoSession: (organizationId: string, { accessToken }: AuthenticatedOptions) =>
    apiClient.get<ApiCuaKhauSoSession>(
      `/organizations/${organizationId}/integrations/cua-khau-so/session`,
      {
        accessToken
      }
    ),

  connectCuaKhauSo: (
    organizationId: string,
    payload: CuaKhauSoLoginPayload,
    { accessToken }: AuthenticatedOptions
  ) =>
    apiClient.post<ApiCuaKhauSoSession>(
      `/organizations/${organizationId}/integrations/cua-khau-so/session`,
      payload,
      {
        accessToken
      }
    ),

  getCuaKhauSoHealth: (organizationId: string, { accessToken }: AuthenticatedOptions) =>
    apiClient.get<ApiCuaKhauSoHealth>(
      `/organizations/${organizationId}/integrations/cua-khau-so/health`,
      {
        accessToken
      }
    ),

  listCuaKhauSoDeclarations: (
    organizationId: string,
    params: ListCuaKhauSoDeclarationsParams,
    { accessToken }: AuthenticatedOptions
  ) =>
    apiClient.get<ApiCuaKhauSoDeclarationList>(
      `/organizations/${organizationId}/integrations/cua-khau-so/declarations${buildCuaKhauSoQuery(
        params
      )}`,
      {
        accessToken
      }
    ),

  getCuaKhauSoDeclaration: (
    organizationId: string,
    externalId: string,
    { accessToken }: AuthenticatedOptions
  ) =>
    apiClient.get<ApiCuaKhauSoDeclarationDetail>(
      `/organizations/${organizationId}/integrations/cua-khau-so/declarations/${externalId}`,
      {
        accessToken
      }
    ),

  syncCuaKhauSoDeclaration: (
    organizationId: string,
    externalId: string,
    payload: SyncCuaKhauSoDeclarationPayload,
    { accessToken }: AuthenticatedOptions
  ) =>
    apiClient.post<ApiCuaKhauSoSyncResult>(
      `/organizations/${organizationId}/integrations/cua-khau-so/declarations/${externalId}/sync`,
      payload,
      {
        accessToken
      }
    ),

  listCuaKhauSoSyncRuns: (organizationId: string, { accessToken }: AuthenticatedOptions) =>
    apiClient.get<ApiIntegrationSyncRun[]>(
      `/organizations/${organizationId}/integrations/cua-khau-so/sync-runs`,
      {
        accessToken
      }
    ),

  listIntegrationSyncRuns: (
    params: ListIntegrationSyncRunsParams,
    { accessToken }: AuthenticatedOptions
  ) => {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        searchParams.set(key, String(value));
      }
    });

    const query = searchParams.toString();
    const path = query ? `/integration-sync-runs?${query}` : '/integration-sync-runs';

    return apiClient.get<ApiIntegrationSyncRunsPage>(path, { accessToken });
  },

  runCuaKhauSoSyncNow: (organizationId: string, { accessToken }: AuthenticatedOptions) =>
    apiClient.post<ApiCuaKhauSoSyncRunResult>(
      `/organizations/${organizationId}/integrations/cua-khau-so/sync-runs`,
      {},
      {
        accessToken
      }
    ),

  listVehicles: (organizationId: string, { accessToken }: AuthenticatedOptions) =>
    apiClient.get<ApiVehicle[]>(`/organizations/${organizationId}/vehicles`, {
      accessToken
    }),

  createVehicle: (
    organizationId: string,
    payload: CreateVehiclePayload,
    { accessToken }: AuthenticatedOptions
  ) =>
    apiClient.post<ApiVehicle>(`/organizations/${organizationId}/vehicles`, payload, {
      accessToken
    }),

  updateVehicle: (
    organizationId: string,
    vehicleId: string,
    payload: UpdateVehiclePayload,
    { accessToken }: AuthenticatedOptions
  ) =>
    apiClient.patch<ApiVehicle>(`/organizations/${organizationId}/vehicles/${vehicleId}`, payload, {
      accessToken
    }),

  deleteVehicle: (
    organizationId: string,
    vehicleId: string,
    { accessToken }: AuthenticatedOptions
  ) =>
    apiClient.delete<{ id: string; deleted: boolean }>(
      `/organizations/${organizationId}/vehicles/${vehicleId}`,
      { accessToken }
    ),

  listDrivers: (organizationId: string, { accessToken }: AuthenticatedOptions) =>
    apiClient.get<ApiDriverProfile[]>(`/organizations/${organizationId}/drivers`, {
      accessToken
    }),

  createDriver: (
    organizationId: string,
    payload: CreateDriverPayload,
    { accessToken }: AuthenticatedOptions
  ) =>
    apiClient.post<ApiDriverProfile>(`/organizations/${organizationId}/drivers`, payload, {
      accessToken
    }),

  updateDriver: (
    organizationId: string,
    driverProfileId: string,
    payload: UpdateDriverPayload,
    { accessToken }: AuthenticatedOptions
  ) =>
    apiClient.patch<ApiDriverProfile>(
      `/organizations/${organizationId}/drivers/${driverProfileId}`,
      payload,
      { accessToken }
    ),

  deleteDriver: (
    organizationId: string,
    driverProfileId: string,
    { accessToken }: AuthenticatedOptions
  ) =>
    apiClient.delete<{ id: string; deleted: boolean }>(
      `/organizations/${organizationId}/drivers/${driverProfileId}`,
      { accessToken }
    ),

  listMyDriverTrips: ({ accessToken }: AuthenticatedOptions) =>
    apiClient.get<ApiTripSummary[]>('/me/driver/trips', {
      accessToken
    }),

  createMyDriverTripMedia: (
    tripId: string,
    payload: CreateDriverTripMediaPayload,
    { accessToken }: AuthenticatedOptions
  ) =>
    apiClient.post<ApiDriverTripMediaResult>(`/me/driver/trips/${tripId}/media`, payload, {
      accessToken
    }),

  getDashboardSummary: (organizationId: string, { accessToken }: AuthenticatedOptions) =>
    apiClient.get<ApiDashboardSummary>(`/organizations/${organizationId}/dashboard/summary`, {
      accessToken
    }),

  listTrips: (
    organizationId: string,
    params: ListTripsParams,
    { accessToken }: AuthenticatedOptions
  ) =>
    apiClient.get<ApiTripSummary[]>(`/organizations/${organizationId}/trips${buildQuery(params)}`, {
      accessToken
    }),

  getTrip: (organizationId: string, tripId: string, { accessToken }: AuthenticatedOptions) =>
    apiClient.get<ApiTripDetail>(`/organizations/${organizationId}/trips/${tripId}`, {
      accessToken
    }),

  listTripEvents: (organizationId: string, tripId: string, { accessToken }: AuthenticatedOptions) =>
    apiClient.get<ApiTripEvent[]>(`/organizations/${organizationId}/trips/${tripId}/events`, {
      accessToken
    }),

  createTripEvent: (
    organizationId: string,
    tripId: string,
    payload: CreateTripEventPayload,
    idempotencyKey: string,
    { accessToken }: AuthenticatedOptions
  ) =>
    apiClient.post<ApiTripEvent>(
      `/organizations/${organizationId}/trips/${tripId}/events`,
      payload,
      {
        accessToken,
        headers: {
          'Idempotency-Key': idempotencyKey
        }
      }
    ),

  listNotificationRules: (organizationId: string, { accessToken }: AuthenticatedOptions) =>
    apiClient.get<ApiNotificationRule[]>(
      `/notification-rules?organizationId=${encodeURIComponent(organizationId)}`,
      { accessToken }
    ),

  getNotificationRule: (ruleId: string, { accessToken }: AuthenticatedOptions) =>
    apiClient.get<ApiNotificationRule>(`/notification-rules/${ruleId}`, { accessToken }),

  createNotificationRule: (
    payload: Record<string, unknown> & { organizationId: string },
    { accessToken }: AuthenticatedOptions
  ) => apiClient.post<ApiNotificationRule>('/notification-rules', payload, { accessToken }),

  updateNotificationRule: (
    ruleId: string,
    payload: Record<string, unknown>,
    { accessToken }: AuthenticatedOptions
  ) =>
    apiClient.patch<ApiNotificationRule>(`/notification-rules/${ruleId}`, payload, {
      accessToken
    }),

  deleteNotificationRule: (ruleId: string, { accessToken }: AuthenticatedOptions) =>
    apiClient.delete<ApiNotificationRule>(`/notification-rules/${ruleId}`, { accessToken }),

  listMyNotificationPreferences: (organizationId: string, { accessToken }: AuthenticatedOptions) =>
    apiClient.get<ApiNotificationPreference[]>(
      `/me/notification-preferences?organizationId=${encodeURIComponent(organizationId)}`,
      { accessToken }
    ),

  upsertMyNotificationPreferences: (
    payload: UpsertNotificationPreferencesPayload,
    { accessToken }: AuthenticatedOptions
  ) =>
    apiClient.put<ApiNotificationPreference[]>('/me/notification-preferences', payload, {
      accessToken
    })
};
