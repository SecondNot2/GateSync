import { apiClient } from '@/lib/api/client';
import type {
  ApiDriverProfile,
  ApiDashboardSummary,
  ApiMembership,
  ApiOrganization,
  ApiTripDetail,
  ApiTripEvent,
  ApiTripSummary,
  ApiVehicle,
  CreateDriverPayload,
  CreateTripEventPayload,
  CreateVehiclePayload,
  InviteMembershipPayload,
  ListTripsParams,
  UpdateDriverPayload,
  UpdateMembershipPayload,
  UpdateVehiclePayload
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

export const gatesyncApi = {
  listOrganizations: ({ accessToken }: AuthenticatedOptions) =>
    apiClient.get<ApiOrganization[]>('/organizations', { accessToken }),

  listMemberships: (organizationId: string, { accessToken }: AuthenticatedOptions) =>
    apiClient.get<ApiMembership[]>(`/organizations/${organizationId}/memberships`, {
      accessToken
    }),

  createMembershipInvitation: (
    organizationId: string,
    payload: InviteMembershipPayload,
    { accessToken }: AuthenticatedOptions
  ) =>
    apiClient.post<
      ApiMembership | { email: string; role: string; status: string; message: string }
    >(`/organizations/${organizationId}/memberships/invitations`, payload, { accessToken }),

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
    )
};
