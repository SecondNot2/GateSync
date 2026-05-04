import { gatesyncApi } from '@/lib/api/gatesync';
import type {
  CreateDriverPayload,
  CuaKhauSoLoginPayload,
  CreateTripEventPayload,
  CreateVehiclePayload,
  ListCuaKhauSoDeclarationsParams,
  ListTripsParams,
  SyncCuaKhauSoDeclarationPayload,
  UpdateDriverPayload,
  UpdateVehiclePayload
} from '@/lib/api/types';
import { resolveWebApiSession } from '@/lib/api/session';
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

export async function loadAdminData(): Promise<AdminViewData> {
  const session = await resolveWebApiSession();

  if (session.mode === 'dev') {
    const fallback = await import('@/lib/operations/dev-fallback');
    return fallback.getDevAdminData(session.reason);
  }

  const organization = await resolveActiveOrganization(session.accessToken);
  const [memberships, vehicles, drivers] = await Promise.all([
    gatesyncApi.listMemberships(organization.id, { accessToken: session.accessToken }),
    gatesyncApi.listVehicles(organization.id, { accessToken: session.accessToken }),
    gatesyncApi.listDrivers(organization.id, { accessToken: session.accessToken })
  ]);

  return toApiAdminView(organization, memberships, vehicles, drivers);
}

export async function loadCuaKhauSoData(
  filters: ListCuaKhauSoDeclarationsParams
): Promise<CuaKhauSoViewData> {
  const session = await resolveWebApiSession();

  if (session.mode === 'dev') {
    const fallback = await import('@/lib/operations/dev-fallback');
    return fallback.getDevCuaKhauSoData(filters, session.reason);
  }

  const organization = await resolveActiveOrganization(session.accessToken);
  const sourceSession = await gatesyncApi.getCuaKhauSoSession(organization.id, {
    accessToken: session.accessToken
  });
  const declarations = sourceSession.authenticated
    ? await gatesyncApi.listCuaKhauSoDeclarations(organization.id, filters, {
        accessToken: session.accessToken
      })
    : {
        declarations: [],
        totalCount: 0,
        totalPage: 0,
        message: 'Vui lòng đăng nhập Cửa khẩu số để xem dữ liệu.'
      };

  return {
    organization: toOrganizationContext(organization, declarations.declarations.length),
    session: sourceSession,
    declarations
  };
}

export async function connectCuaKhauSo(payload: CuaKhauSoLoginPayload) {
  const session = await resolveWriteSession();
  const organization = await resolveActiveOrganization(session.accessToken);

  return gatesyncApi.connectCuaKhauSo(organization.id, payload, {
    accessToken: session.accessToken
  });
}

export async function getCuaKhauSoDeclaration(externalId: string) {
  const session = await resolveWriteSession();
  const organization = await resolveActiveOrganization(session.accessToken);

  return gatesyncApi.getCuaKhauSoDeclaration(organization.id, externalId, {
    accessToken: session.accessToken
  });
}

export async function syncCuaKhauSoDeclaration(
  externalId: string,
  payload: SyncCuaKhauSoDeclarationPayload = {}
) {
  const session = await resolveWriteSession();
  const organization = await resolveActiveOrganization(session.accessToken);

  return gatesyncApi.syncCuaKhauSoDeclaration(organization.id, externalId, payload, {
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

  const organization = await resolveActiveOrganization(session.accessToken);

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
  const organization = await resolveActiveOrganization(session.accessToken);

  return gatesyncApi.createVehicle(organization.id, payload, { accessToken: session.accessToken });
}

export async function updateAdminVehicle(vehicleId: string, payload: UpdateVehiclePayload) {
  const session = await resolveWriteSession();
  const organization = await resolveActiveOrganization(session.accessToken);

  return gatesyncApi.updateVehicle(organization.id, vehicleId, payload, {
    accessToken: session.accessToken
  });
}

export async function deleteAdminVehicle(vehicleId: string) {
  const session = await resolveWriteSession();
  const organization = await resolveActiveOrganization(session.accessToken);

  return gatesyncApi.deleteVehicle(organization.id, vehicleId, {
    accessToken: session.accessToken
  });
}

export async function createAdminDriver(payload: CreateDriverPayload) {
  const session = await resolveWriteSession();
  const organization = await resolveActiveOrganization(session.accessToken);

  return gatesyncApi.createDriver(organization.id, payload, { accessToken: session.accessToken });
}

export async function updateAdminDriver(driverProfileId: string, payload: UpdateDriverPayload) {
  const session = await resolveWriteSession();
  const organization = await resolveActiveOrganization(session.accessToken);

  return gatesyncApi.updateDriver(organization.id, driverProfileId, payload, {
    accessToken: session.accessToken
  });
}

export async function deleteAdminDriver(driverProfileId: string) {
  const session = await resolveWriteSession();
  const organization = await resolveActiveOrganization(session.accessToken);

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

async function resolveActiveOrganization(accessToken: string) {
  const organizations = await gatesyncApi.listOrganizations({ accessToken });
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
      throw new Error(
        `Quyền truy cập tổ chức ${suspendedOrganization.name} đang bị tạm dừng. Vui lòng liên hệ quản trị viên tổ chức.`
      );
    }

    if (removedOrganization) {
      throw new Error(
        `Tài khoản của bạn đã bị gỡ khỏi tổ chức ${removedOrganization.name}. Vui lòng liên hệ quản trị viên nếu cần khôi phục quyền truy cập.`
      );
    }

    if (invitedOrganization) {
      throw new Error(
        `Lời mời vào tổ chức ${invitedOrganization.name} chưa được kích hoạt. Vui lòng kiểm tra email mời hoặc liên hệ quản trị viên.`
      );
    }

    throw new Error(
      'Tài khoản của bạn chưa thuộc tổ chức đang hoạt động nào trong GateSync. Vui lòng liên hệ quản trị viên để được mời vào tổ chức.'
    );
  }

  return activeOrganization;
}

function createIdempotencyKey(tripId: string) {
  const randomValue =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `web:manual-event:${tripId}:${randomValue}`;
}
