import { gatesyncApi } from '@/lib/api/gatesync';
import { hasOrganizationPermission } from '@gatesync/shared';
import type {
  ApiCurrentUser,
  ApiOrganization,
  CreateDriverPayload,
  CreateDriverTripMediaPayload,
  CuaKhauSoLoginPayload,
  CreateTripEventPayload,
  CreateVehiclePayload,
  ListCuaKhauSoDeclarationsParams,
  ListTripsParams,
  SyncCuaKhauSoDeclarationPayload,
  UpdateDriverPayload,
  UpdateVehiclePayload
} from '@/lib/api/types';
import { resolveWebApiSession, type WebApiSession } from '@/lib/api/session';
import { OrganizationAccessError } from '@/lib/operations/errors';
import type {
  AdminViewData,
  CuaKhauSoViewData,
  DashboardViewData,
  TripDetailViewData,
  TripsViewData
} from '@/lib/operations/view-model';
import {
  toApiAdminView,
  toApiDashboardView,
  toApiTripDetailView,
  toApiTripsView,
  toOrganizationContext
} from '@/lib/operations/view-model';

type ActiveOrganizationContext = {
  organization: ApiOrganization;
  currentUser: ApiCurrentUser;
};

let browserActiveOrganizationCache:
  | {
      accessToken: string;
      expiresAt: number;
      promise: Promise<ActiveOrganizationContext>;
    }
  | undefined;

export async function loadDashboardData(): Promise<DashboardViewData> {
  const session = await resolveWebApiSession();

  return loadDashboardDataForSession(session);
}

export async function loadDashboardDataForSession(
  session: WebApiSession
): Promise<DashboardViewData> {
  if (session.mode === 'dev') {
    const fallback = await import('@/lib/operations/dev-fallback');
    return fallback.getDevDashboardData(session.reason);
  }

  const { organization, currentUser } = await resolveActiveOrganization(session.accessToken);
  const [summary, featuredTrips] = await Promise.all([
    gatesyncApi.getDashboardSummary(organization.id, { accessToken: session.accessToken }),
    gatesyncApi.listTrips(organization.id, { limit: 8 }, { accessToken: session.accessToken })
  ]);

  return toApiDashboardView(organization, currentUser, summary, featuredTrips);
}

export async function loadTripsData(filters: ListTripsParams): Promise<TripsViewData> {
  const session = await resolveWebApiSession();

  return loadTripsDataForSession(session, filters);
}

export async function loadTripsDataForSession(
  session: WebApiSession,
  filters: ListTripsParams
): Promise<TripsViewData> {
  if (session.mode === 'dev') {
    const fallback = await import('@/lib/operations/dev-fallback');
    return fallback.getDevTripsData(filters, session.reason);
  }

  const { organization, currentUser } = await resolveActiveOrganization(session.accessToken);
  const trips = await gatesyncApi.listTrips(organization.id, filters, {
    accessToken: session.accessToken
  });

  return toApiTripsView(organization, currentUser, trips, filters);
}

export async function loadTripDetailData(tripId: string): Promise<TripDetailViewData> {
  const session = await resolveWebApiSession();

  return loadTripDetailDataForSession(session, tripId);
}

export async function loadTripDetailDataForSession(
  session: WebApiSession,
  tripId: string
): Promise<TripDetailViewData> {
  if (session.mode === 'dev') {
    const fallback = await import('@/lib/operations/dev-fallback');
    return fallback.getDevTripDetailData(tripId, session.reason);
  }

  const { organization, currentUser } = await resolveActiveOrganization(session.accessToken);
  const [trip, events] = await Promise.all([
    gatesyncApi.getTrip(organization.id, tripId, { accessToken: session.accessToken }),
    gatesyncApi.listTripEvents(organization.id, tripId, { accessToken: session.accessToken })
  ]);

  return toApiTripDetailView(organization, currentUser, trip, events);
}

export async function loadAdminData(): Promise<AdminViewData> {
  const session = await resolveWebApiSession();

  return loadAdminDataForSession(session);
}

export async function loadAdminDataForSession(session: WebApiSession): Promise<AdminViewData> {
  if (session.mode === 'dev') {
    const fallback = await import('@/lib/operations/dev-fallback');
    return fallback.getDevAdminData(session.reason);
  }

  const { organization, currentUser } = await resolveActiveOrganization(session.accessToken);
  const [memberships, vehicles, drivers] = await Promise.all([
    gatesyncApi.listMemberships(organization.id, { accessToken: session.accessToken }),
    gatesyncApi.listVehicles(organization.id, { accessToken: session.accessToken }),
    gatesyncApi.listDrivers(organization.id, { accessToken: session.accessToken })
  ]);

  return toApiAdminView(organization, currentUser, memberships, vehicles, drivers);
}

export async function createMembershipInvitation(
  payload: Parameters<typeof gatesyncApi.createMembershipInvitation>[1]
) {
  const session = await resolveWriteSession();
  const { organization } = await resolveActiveOrganization(session.accessToken);

  return gatesyncApi.createMembershipInvitation(organization.id, payload, {
    accessToken: session.accessToken
  });
}

export async function acceptMembershipInvitation(code: string) {
  const session = await resolveWriteSession();

  return gatesyncApi.acceptMembershipInvitation(
    {
      code
    },
    {
      accessToken: session.accessToken
    }
  );
}

export async function loadCuaKhauSoData(
  filters: ListCuaKhauSoDeclarationsParams
): Promise<CuaKhauSoViewData> {
  const session = await resolveWebApiSession();

  if (session.mode === 'dev') {
    const fallback = await import('@/lib/operations/dev-fallback');
    return fallback.getDevCuaKhauSoData(filters, session.reason);
  }

  const { organization, currentUser } = await resolveActiveOrganization(session.accessToken);
  const [sourceSession, health, declarations] = await Promise.all([
    gatesyncApi.getCuaKhauSoSession(organization.id, {
      accessToken: session.accessToken
    }),
    gatesyncApi.getCuaKhauSoHealth(organization.id, {
      accessToken: session.accessToken
    }),
    gatesyncApi.listCuaKhauSoDeclarations(organization.id, filters, {
      accessToken: session.accessToken
    })
  ]);
  const activeMembership = organization.currentUserMembership;
  const syncRuns = hasOrganizationPermission(activeMembership.role, 'integrations:cua-khau-so:sync')
    ? await gatesyncApi.listCuaKhauSoSyncRuns(organization.id, {
        accessToken: session.accessToken
      })
    : [];

  return {
    organization: toOrganizationContext(
      organization,
      currentUser,
      declarations.declarations.length
    ),
    session: sourceSession,
    health,
    declarations,
    syncRuns
  };
}

export async function connectCuaKhauSo(payload: CuaKhauSoLoginPayload) {
  const session = await resolveWriteSession();
  const { organization } = await resolveActiveOrganization(session.accessToken);

  return gatesyncApi.connectCuaKhauSo(organization.id, payload, {
    accessToken: session.accessToken
  });
}

export async function getCuaKhauSoDeclaration(externalId: string) {
  const session = await resolveWriteSession();
  const { organization } = await resolveActiveOrganization(session.accessToken);

  return gatesyncApi.getCuaKhauSoDeclaration(organization.id, externalId, {
    accessToken: session.accessToken
  });
}

export async function syncCuaKhauSoDeclaration(
  externalId: string,
  payload: SyncCuaKhauSoDeclarationPayload = {}
) {
  const session = await resolveWriteSession();
  const { organization } = await resolveActiveOrganization(session.accessToken);

  return gatesyncApi.syncCuaKhauSoDeclaration(organization.id, externalId, payload, {
    accessToken: session.accessToken
  });
}

export async function runCuaKhauSoSyncNow() {
  const session = await resolveWriteSession();
  const { organization } = await resolveActiveOrganization(session.accessToken);

  return gatesyncApi.runCuaKhauSoSyncNow(organization.id, {
    accessToken: session.accessToken
  });
}

export async function loadMyDriverTrips() {
  const session = await resolveWriteSession();

  return gatesyncApi.listMyDriverTrips({
    accessToken: session.accessToken
  });
}

export async function createMyDriverTripMedia(
  tripId: string,
  payload: CreateDriverTripMediaPayload
) {
  const session = await resolveWriteSession();

  return gatesyncApi.createMyDriverTripMedia(tripId, payload, {
    accessToken: session.accessToken
  });
}

export async function createManualTripEvent(tripId: string, payload: CreateTripEventPayload) {
  const session = await resolveWebApiSession();

  if (session.mode === 'dev') {
    throw new Error(
      'Chế độ dữ liệu mẫu chỉ cho phép xem. Hãy cấu hình Supabase/API để ghi nhận sự kiện thật.'
    );
  }

  const { organization } = await resolveActiveOrganization(session.accessToken);

  return gatesyncApi.createTripEvent(
    organization.id,
    tripId,
    payload,
    createIdempotencyKey(tripId),
    { accessToken: session.accessToken }
  );
}

export async function createAdminVehicle(payload: CreateVehiclePayload) {
  const session = await resolveWriteSession();
  const { organization } = await resolveActiveOrganization(session.accessToken);

  return gatesyncApi.createVehicle(organization.id, payload, { accessToken: session.accessToken });
}

export async function updateAdminVehicle(vehicleId: string, payload: UpdateVehiclePayload) {
  const session = await resolveWriteSession();
  const { organization } = await resolveActiveOrganization(session.accessToken);

  return gatesyncApi.updateVehicle(organization.id, vehicleId, payload, {
    accessToken: session.accessToken
  });
}

export async function deleteAdminVehicle(vehicleId: string) {
  const session = await resolveWriteSession();
  const { organization } = await resolveActiveOrganization(session.accessToken);

  return gatesyncApi.deleteVehicle(organization.id, vehicleId, {
    accessToken: session.accessToken
  });
}

export async function createAdminDriver(payload: CreateDriverPayload) {
  const session = await resolveWriteSession();
  const { organization } = await resolveActiveOrganization(session.accessToken);

  return gatesyncApi.createDriver(organization.id, payload, { accessToken: session.accessToken });
}

export async function updateAdminDriver(driverProfileId: string, payload: UpdateDriverPayload) {
  const session = await resolveWriteSession();
  const { organization } = await resolveActiveOrganization(session.accessToken);

  return gatesyncApi.updateDriver(organization.id, driverProfileId, payload, {
    accessToken: session.accessToken
  });
}

export async function deleteAdminDriver(driverProfileId: string) {
  const session = await resolveWriteSession();
  const { organization } = await resolveActiveOrganization(session.accessToken);

  return gatesyncApi.deleteDriver(organization.id, driverProfileId, {
    accessToken: session.accessToken
  });
}

async function resolveWriteSession() {
  const session = await resolveWebApiSession();

  if (session.mode === 'dev') {
    throw new Error(
      'Chế độ dữ liệu mẫu chỉ cho phép xem. Hãy cấu hình Supabase/API để cập nhật quản trị thật.'
    );
  }

  return session;
}

async function resolveActiveOrganization(accessToken: string): Promise<ActiveOrganizationContext> {
  if (
    typeof window !== 'undefined' &&
    browserActiveOrganizationCache?.accessToken === accessToken &&
    browserActiveOrganizationCache.expiresAt > Date.now()
  ) {
    return browserActiveOrganizationCache.promise;
  }

  const promise = fetchActiveOrganization(accessToken);

  if (typeof window !== 'undefined') {
    browserActiveOrganizationCache = {
      accessToken,
      expiresAt: Date.now() + 30_000,
      promise
    };
  }

  try {
    return await promise;
  } catch (error) {
    if (typeof window !== 'undefined') {
      browserActiveOrganizationCache = undefined;
    }

    throw error;
  }
}

async function fetchActiveOrganization(accessToken: string): Promise<ActiveOrganizationContext> {
  const [currentUser, organizations] = await Promise.all([
    gatesyncApi.getMe({ accessToken }),
    gatesyncApi.listOrganizations({ accessToken })
  ]);
  const activeOrganization = organizations.find(
    (organization) => organization.currentUserMembership.status === 'ACTIVE'
  );

  if (!activeOrganization) {
    const suspendedOrganization = organizations.find(
      (organization) => organization.currentUserMembership.status === 'SUSPENDED'
    );
    const removedOrganization = organizations.find(
      (organization) => organization.currentUserMembership.status === 'REMOVED'
    );
    const invitedOrganization = organizations.find(
      (organization) => organization.currentUserMembership.status === 'INVITED'
    );

    if (suspendedOrganization) {
      throw new OrganizationAccessError(
        'SUSPENDED',
        `Quyền truy cập tổ chức ${suspendedOrganization.name} đang bị tạm dừng. Vui lòng liên hệ quản trị viên tổ chức.`,
        suspendedOrganization.name
      );
    }

    if (removedOrganization) {
      throw new OrganizationAccessError(
        'REMOVED',
        `Tài khoản của bạn đã bị gỡ khỏi tổ chức ${removedOrganization.name}. Vui lòng liên hệ quản trị viên nếu cần khôi phục quyền truy cập.`,
        removedOrganization.name
      );
    }

    if (invitedOrganization) {
      throw new OrganizationAccessError(
        'INVITED',
        `Lời mời vào tổ chức ${invitedOrganization.name} chưa được kích hoạt. Vui lòng kiểm tra email mời hoặc liên hệ quản trị viên.`,
        invitedOrganization.name
      );
    }

    throw new OrganizationAccessError(
      'NO_ORGANIZATION',
      'Tài khoản của bạn chưa thuộc tổ chức đang hoạt động nào trong GateSync. Hãy tạo tổ chức doanh nghiệp hoặc dùng lời mời từ tổ chức hiện có.'
    );
  }

  return {
    organization: activeOrganization,
    currentUser
  };
}

function createIdempotencyKey(tripId: string) {
  const randomValue =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `web:manual-event:${tripId}:${randomValue}`;
}
