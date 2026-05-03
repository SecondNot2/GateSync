import { apiClient } from '@/lib/api/client';
import type {
  ApiDashboardSummary,
  ApiOrganization,
  ApiTripDetail,
  ApiTripEvent,
  ApiTripSummary,
  CreateTripEventPayload,
  ListTripsParams
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
