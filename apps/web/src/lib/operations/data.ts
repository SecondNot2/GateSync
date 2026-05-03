import { gatesyncApi } from '@/lib/api/gatesync';
import type { CreateTripEventPayload, ListTripsParams } from '@/lib/api/types';
import { resolveWebApiSession } from '@/lib/api/session';
import type { DashboardViewData, TripDetailViewData, TripsViewData } from '@/lib/operations/view-model';
import {
  toApiDashboardView,
  toApiTripDetailView,
  toApiTripsView
} from '@/lib/operations/view-model';

export async function loadDashboardData(): Promise<DashboardViewData> {
  const session = await resolveWebApiSession();

  if (session.mode === 'dev') {
    const fallback = await import('@/lib/operations/dev-fallback');
    return fallback.getDevDashboardData(session.reason);
  }

  const organization = await resolveActiveOrganization(session.accessToken);
  const [summary, featuredTrips] = await Promise.all([
    gatesyncApi.getDashboardSummary(organization.id, { accessToken: session.accessToken }),
    gatesyncApi.listTrips(organization.id, { limit: 8 }, { accessToken: session.accessToken })
  ]);

  return toApiDashboardView(organization, summary, featuredTrips);
}

export async function loadTripsData(filters: ListTripsParams): Promise<TripsViewData> {
  const session = await resolveWebApiSession();

  if (session.mode === 'dev') {
    const fallback = await import('@/lib/operations/dev-fallback');
    return fallback.getDevTripsData(filters, session.reason);
  }

  const organization = await resolveActiveOrganization(session.accessToken);
  const trips = await gatesyncApi.listTrips(organization.id, filters, {
    accessToken: session.accessToken
  });

  return toApiTripsView(organization, trips, filters);
}

export async function loadTripDetailData(tripId: string): Promise<TripDetailViewData> {
  const session = await resolveWebApiSession();

  if (session.mode === 'dev') {
    const fallback = await import('@/lib/operations/dev-fallback');
    return fallback.getDevTripDetailData(tripId, session.reason);
  }

  const organization = await resolveActiveOrganization(session.accessToken);
  const [trip, events] = await Promise.all([
    gatesyncApi.getTrip(organization.id, tripId, { accessToken: session.accessToken }),
    gatesyncApi.listTripEvents(organization.id, tripId, { accessToken: session.accessToken })
  ]);

  return toApiTripDetailView(organization, trip, events);
}

export async function createManualTripEvent(tripId: string, payload: CreateTripEventPayload) {
  const session = await resolveWebApiSession();

  if (session.mode === 'dev') {
    throw new Error('Chế độ dữ liệu mẫu chỉ cho phép xem. Hãy cấu hình Supabase/API để ghi nhận sự kiện thật.');
  }

  const organization = await resolveActiveOrganization(session.accessToken);

  return gatesyncApi.createTripEvent(
    organization.id,
    tripId,
    payload,
    createIdempotencyKey(tripId),
    { accessToken: session.accessToken }
  );
}

async function resolveActiveOrganization(accessToken: string) {
  const organizations = await gatesyncApi.listOrganizations({ accessToken });
  const activeOrganization = organizations.find(
    (organization) => organization.currentUserMembership.status === 'ACTIVE'
  );

  if (!activeOrganization) {
    throw new Error('Tài khoản của bạn chưa có tổ chức đang hoạt động trong GateSync.');
  }

  return activeOrganization;
}

function createIdempotencyKey(tripId: string) {
  const randomValue = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `web:manual-event:${tripId}:${randomValue}`;
}
