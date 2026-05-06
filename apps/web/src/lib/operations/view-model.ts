import {
  getRolePermissions,
  hasAnyOrganizationPermission,
  hasOrganizationPermission,
  type MembershipRole,
  type MembershipStatus,
  type OrganizationPermission,
  type OrganizationType,
  type OwnershipType,
  type TripDirection,
  type TripEventSource,
  type TripEventStatus,
  type TripEventType,
  type TripParticipantRole,
  type TripStatus,
  type TripType,
  type VehicleType,
  type VisibilityLevel
} from '@gatesync/shared';
import type {
  ApiCurrentUser,
  ApiCuaKhauSoHealth,
  ApiIntegrationSyncRun,
  ApiDashboardSummary,
  ApiCuaKhauSoDeclarationList,
  ApiCuaKhauSoSession,
  ApiDriverProfile,
  ApiMembership,
  ApiOrganization,
  ApiTripDetail,
  ApiTripEvent,
  ApiTripExceptionCode,
  ApiTripSummary,
  ApiVehicle,
  ListTripsParams
} from '@/lib/api/types';

type ApiTripEventWithTrip = ApiTripEvent & {
  trip?: {
    tripCode?: string;
    borderGate?: {
      name: string;
    } | null;
  } | null;
};

export type OperationsPriority = 'HIGH' | 'MEDIUM' | 'NORMAL';

export type OperationsOrganizationContext = {
  id?: string;
  name: string;
  type: OrganizationType;
  controlScore: string;
  tripBadge?: string;
  notice?: string;
  currentUser?: OperationsCurrentUser;
};

export type OperationsCurrentUser = {
  id: string;
  name: string;
  email: string;
  role: MembershipRole;
  permissions: OrganizationPermission[];
  activeOrganizationCount: number;
  canReadTrips: boolean;
  canManageTrips: boolean;
  canManageMembers: boolean;
  canManageFleet: boolean;
  canUseCuaKhauSoIntegration: boolean;
  canConnectCuaKhauSoIntegration: boolean;
  canSyncCuaKhauSoIntegration: boolean;
  canManageBilling: boolean;
  canOpenAdmin: boolean;
};

export type OperationsTripEvent = {
  id: string;
  tripId: string;
  tripCode?: string;
  borderGate?: string;
  eventType: TripEventType;
  eventStatus: TripEventStatus;
  source: TripEventSource;
  occurredAt: string;
  recordedAt: string;
  actor: string;
  note: string;
  confidence?: number;
};

export type OperationsTripSummary = {
  id: string;
  tripCode: string;
  tripType: TripType;
  direction: TripDirection;
  currentStatus: TripStatus;
  statusUpdatedAt: string;
  borderGate: string;
  borderGateId?: string;
  yard: string;
  yardId?: string;
  vehicle: {
    plateNumber: string;
    type: VehicleType;
  };
  driver: {
    name: string;
    phone: string;
  };
  plannedStartAt: string;
  plannedArrivalAt: string;
  delayMinutes: number;
  statusDurationMinutes: number;
  priority: OperationsPriority;
  nextAction: string;
  nextActionLabel: string;
  exceptionCodes: ApiTripExceptionCode[];
  availableManualActions: TripEventType[];
  eventCount: number;
};

export type OperationsTripDetail = OperationsTripSummary & {
  shipment: {
    description: string;
    containerNumber: string;
    sealNumber: string;
    weightKg: string;
  };
  declaration: {
    number: string;
    status: string;
    customsOfficeCode: string;
  };
  participants: Array<{
    id: string;
    label: string;
    role: TripParticipantRole;
    visibilityLevel: VisibilityLevel;
  }>;
  events: OperationsTripEvent[];
};

export type OperationsMetric = {
  label: string;
  value: string;
  trend: string;
  indicatorClass: string;
};

export type OperationsStatusGroup = {
  label: string;
  description: string;
  count: number;
  statuses: TripStatus[];
  tone: string;
};

export type DashboardViewData = {
  organization: OperationsOrganizationContext;
  metrics: OperationsMetric[];
  statusGroups: OperationsStatusGroup[];
  urgentTrips: OperationsTripSummary[];
  featuredTrips: OperationsTripSummary[];
  recentEvents: OperationsTripEvent[];
  notice?: string;
};

export type TripsViewData = {
  organization: OperationsOrganizationContext;
  trips: OperationsTripSummary[];
  filters: ListTripsParams;
  notice?: string;
};

export type CuaKhauSoViewData = {
  organization: OperationsOrganizationContext;
  session: ApiCuaKhauSoSession;
  health: ApiCuaKhauSoHealth;
  declarations: ApiCuaKhauSoDeclarationList;
  syncRuns: ApiIntegrationSyncRun[];
  notice?: string;
};

export type TripDetailViewData = {
  organization: OperationsOrganizationContext;
  trip: OperationsTripDetail;
  notice?: string;
};

export type AdminOrganizationProfile = {
  id: string;
  name: string;
  type: OrganizationType;
  taxCode: string;
  location: string;
  email: string;
  phone: string;
  currentUserRole: MembershipRole;
  canManageMembers: boolean;
  canManageFleet: boolean;
  canOpenAdmin: boolean;
};

export type AdminMember = {
  id: string;
  name: string;
  email: string;
  role: MembershipRole;
  status: MembershipStatus;
  lastActiveAt: string;
};

export type AdminVehicle = {
  id: string;
  plateNumber: string;
  vehicleType: VehicleType;
  ownershipType: OwnershipType;
  defaultDriverId?: string;
  defaultDriver: string;
  currentTrip: string;
  health: string;
};

export type AdminDriver = {
  id: string;
  name: string;
  phone: string;
  licenseNumber: string;
  assignedVehicle: string;
  activeTrip: string;
  identityStatus: string;
};

export type AdminViewData = {
  organization: OperationsOrganizationContext;
  profile: AdminOrganizationProfile;
  members: AdminMember[];
  vehicles: AdminVehicle[];
  drivers: AdminDriver[];
  notice?: string;
};

const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});

const statusGroupDisplay: Record<string, Omit<OperationsStatusGroup, 'count' | 'statuses'>> = {
  notStarted: {
    label: 'Chưa bắt đầu',
    description: 'Chuyến đã lập kế hoạch và chờ xuất phát',
    tone: 'bg-slate-100 text-slate-700'
  },
  moving: {
    label: 'Đang di chuyển',
    description: 'Xe đang tiến về khu vực cửa khẩu hoặc điểm tập kết',
    tone: 'bg-sky-100 text-sky-700'
  },
  waitingYard: {
    label: 'Chờ vào bãi',
    description: 'Xe đã đến khu vực cửa khẩu và đang chờ điều phối bãi',
    tone: 'bg-amber-100 text-amber-700'
  },
  inYard: {
    label: 'Trong bãi',
    description: 'Xe đang nằm trong bãi hoặc chờ xác nhận rời bãi',
    tone: 'bg-indigo-100 text-indigo-700'
  },
  customs: {
    label: 'Xử lý hải quan',
    description: 'Tờ khai, kiểm hóa hoặc phí đang được xử lý',
    tone: 'bg-violet-100 text-violet-700'
  },
  blockedOrDelayed: {
    label: 'Chậm hoặc bị chặn',
    description: 'Cần điều phối viên theo dõi ngay',
    tone: 'bg-rose-100 text-rose-700'
  }
};

const participantRoleLabels: Record<TripParticipantRole, string> = {
  OWNER_ORG: 'Đơn vị vận hành',
  DRIVER: 'Tài xế',
  CARGO_OWNER: 'Chủ hàng',
  CUSTOMS_AGENT: 'Đại lý hải quan',
  FIELD_OPERATOR: 'Hiện trường',
  VIEWER: 'Chỉ xem'
};

export function formatApiDateTime(value?: string | null) {
  if (!value) {
    return 'Chưa có dữ liệu';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Chưa có dữ liệu';
  }

  return dateTimeFormatter.format(date);
}

export function toApiDashboardView(
  organization: ApiOrganization,
  currentUser: ApiCurrentUser,
  summary: ApiDashboardSummary,
  featuredTrips: ApiTripSummary[]
): DashboardViewData {
  const mappedFeaturedTrips = featuredTrips.map(toTripSummaryView);
  const delayedTrips = summary.metrics.delayedTrips;
  const activeTrips = summary.metrics.activeTrips;

  return {
    organization: toOrganizationContext(organization, currentUser, activeTrips),
    metrics: [
      {
        label: 'Chuyến đang vận hành',
        value: String(activeTrips),
        trend: 'Đọc từ dữ liệu chuyến hiện tại',
        indicatorClass: 'bg-sky-400'
      },
      {
        label: 'Xe chậm cần xử lý',
        value: String(delayedTrips),
        trend:
          delayedTrips > 0
            ? `Chậm nhất ${summary.delaySummary.longestDelayMinutes} phút, trung bình ${summary.delaySummary.averageDelayMinutes} phút`
            : 'Chưa có xe quá hạn',
        indicatorClass: 'bg-amber-400'
      },
      {
        label: 'Chuyến cần chú ý',
        value: String(summary.metrics.attentionTrips),
        trend: `Bị chặn: ${summary.delaySummary.blockedTrips}, quá lâu: ${summary.delaySummary.staleTrips}`,
        indicatorClass: 'bg-rose-400'
      },
      {
        label: 'Sự kiện hôm nay',
        value: String(summary.metrics.eventsToday),
        trend: `Cập nhật lúc ${formatApiDateTime(summary.generatedAt)}`,
        indicatorClass: 'bg-emerald-400'
      }
    ],
    statusGroups: summary.statusGroups.map((group) => {
      const display = statusGroupDisplay[group.key] ?? {
        label: 'Nhóm trạng thái',
        description: 'Nhóm trạng thái vận hành',
        tone: 'bg-slate-100 text-slate-700'
      };

      return {
        ...display,
        count: group.count,
        statuses: group.statuses
      };
    }),
    urgentTrips: summary.urgentTrips.map(toTripSummaryView),
    featuredTrips: mappedFeaturedTrips,
    recentEvents: summary.recentEvents.map((event) => toTripEventView(event))
  };
}

export function toApiTripsView(
  organization: ApiOrganization,
  currentUser: ApiCurrentUser,
  trips: ApiTripSummary[],
  filters: ListTripsParams
): TripsViewData {
  return {
    organization: toOrganizationContext(organization, currentUser, trips.length),
    trips: trips.map(toTripSummaryView),
    filters
  };
}

export function toApiTripDetailView(
  organization: ApiOrganization,
  currentUser: ApiCurrentUser,
  trip: ApiTripDetail,
  events: ApiTripEvent[]
): TripDetailViewData {
  const summary = toTripSummaryView(trip);

  return {
    organization: toOrganizationContext(organization, currentUser),
    trip: {
      ...summary,
      shipment: {
        description: trip.shipment?.description ?? 'Chưa có mô tả hàng hóa',
        containerNumber: trip.shipment?.containerNumber ?? 'Chưa cập nhật',
        sealNumber: trip.shipment?.sealNumber ?? 'Chưa cập nhật',
        weightKg: formatWeight(trip.shipment?.weightKg)
      },
      declaration: {
        number: trip.customsDeclaration?.declarationNumber ?? 'Chưa liên kết tờ khai',
        status: trip.customsDeclaration?.status ?? 'Chưa cập nhật',
        customsOfficeCode: trip.customsDeclaration?.customsOfficeCode ?? 'Chưa cập nhật'
      },
      participants: trip.participants.map((participant) => ({
        id: participant.id,
        label:
          participant.user?.fullName ??
          participant.organization?.name ??
          participantRoleLabels[participant.role],
        role: participant.role,
        visibilityLevel: participant.visibilityLevel
      })),
      events: events.map((event) => toTripEventView(event))
    }
  };
}

export function toApiAdminView(
  organization: ApiOrganization,
  currentUser: ApiCurrentUser,
  memberships: ApiMembership[],
  vehicles: ApiVehicle[],
  drivers: ApiDriverProfile[]
): AdminViewData {
  const currentUserRole = organization.currentUserMembership.role;
  const currentUserContext = toCurrentUserContext(organization, currentUser);

  return {
    organization: toOrganizationContext(organization, currentUser),
    profile: {
      id: organization.id,
      name: organization.name,
      type: organization.type,
      taxCode: organization.taxCode ?? 'Chưa cập nhật',
      location: organization.address ?? 'Chưa cập nhật địa bàn',
      email: organization.email ?? 'Chưa cập nhật',
      phone: organization.phone ?? 'Chưa cập nhật',
      currentUserRole,
      canManageMembers: currentUserContext.canManageMembers,
      canManageFleet: currentUserContext.canManageFleet,
      canOpenAdmin: currentUserContext.canOpenAdmin
    },
    members: memberships.map(toAdminMemberView),
    vehicles: vehicles.map(toAdminVehicleView),
    drivers: drivers.map(toAdminDriverView)
  };
}

export function toOrganizationContext(
  organization: ApiOrganization,
  currentUser: ApiCurrentUser,
  activeTripCount?: number
): OperationsOrganizationContext {
  const context: OperationsOrganizationContext = {
    id: organization.id,
    name: organization.name,
    type: organization.type,
    controlScore: 'API',
    currentUser: toCurrentUserContext(organization, currentUser)
  };

  if (activeTripCount !== undefined) {
    context.tripBadge = String(activeTripCount);
  }

  return context;
}

function toCurrentUserContext(
  organization: ApiOrganization,
  currentUser: ApiCurrentUser
): OperationsCurrentUser {
  const role = organization.currentUserMembership.role;
  const activeOrganizationCount = currentUser.memberships.filter(
    (membership) => membership.status === 'ACTIVE'
  ).length;

  return {
    id: currentUser.id,
    name: currentUser.fullName?.trim() || currentUser.email || 'Người dùng GateSync',
    email: currentUser.email ?? 'Chưa cập nhật email',
    role,
    permissions: getRolePermissions(role),
    activeOrganizationCount,
    canReadTrips: hasOrganizationPermission(role, 'trips:read'),
    canManageTrips: hasOrganizationPermission(role, 'trips:manage'),
    canManageMembers: hasOrganizationPermission(role, 'memberships:manage'),
    canManageFleet: hasOrganizationPermission(role, 'fleet:manage'),
    canUseCuaKhauSoIntegration: hasOrganizationPermission(role, 'integrations:cua-khau-so:read'),
    canConnectCuaKhauSoIntegration: hasOrganizationPermission(
      role,
      'integrations:cua-khau-so:connect'
    ),
    canSyncCuaKhauSoIntegration: hasOrganizationPermission(role, 'integrations:cua-khau-so:sync'),
    canManageBilling: hasOrganizationPermission(role, 'billing:manage'),
    canOpenAdmin: hasAnyOrganizationPermission(role, [
      'organizations:update',
      'memberships:manage',
      'fleet:manage'
    ])
  };
}

export function toTripSummaryView(trip: ApiTripSummary): OperationsTripSummary {
  const operationalState = trip.operationalState;
  const delayMinutes = operationalState?.delayMinutes ?? calculateDelayMinutes(trip);
  const priority = operationalState?.priority ?? getTripPriority(trip, delayMinutes);

  const summary: OperationsTripSummary = {
    id: trip.id,
    tripCode: trip.tripCode,
    tripType: trip.tripType,
    direction: trip.direction,
    currentStatus: trip.currentStatus,
    statusUpdatedAt: formatApiDateTime(
      trip.currentStatusUpdatedAt ?? trip.updatedAt ?? trip.createdAt
    ),
    borderGate: trip.borderGate?.name ?? trip.sourceSummary?.gateName ?? 'Chưa chọn cửa khẩu',
    yard: trip.yard?.name ?? trip.sourceSummary?.yardName ?? 'Chưa chọn bãi',
    vehicle: {
      plateNumber: trip.vehicle?.plateNumber ?? trip.sourceSummary?.vehiclePlate ?? 'Chưa gán xe',
      type: trip.vehicle?.vehicleType ?? 'OTHER'
    },
    driver: {
      name: resolveDriverName(trip.driverProfile, trip.sourceSummary?.driverName),
      phone: trip.driverProfile?.phone ?? trip.driverProfile?.user?.phone ?? 'Chưa cập nhật'
    },
    plannedStartAt: formatApiDateTime(trip.plannedStartAt),
    plannedArrivalAt: formatApiDateTime(trip.plannedArrivalAt),
    delayMinutes,
    statusDurationMinutes: operationalState?.statusDurationMinutes ?? 0,
    priority,
    nextAction:
      operationalState?.nextAction.description ?? getNextAction(trip.currentStatus, delayMinutes),
    nextActionLabel: operationalState?.nextAction.label ?? 'Việc cần làm tiếp theo',
    exceptionCodes: operationalState?.exceptionCodes ?? [],
    availableManualActions: operationalState?.availableManualActions ?? [],
    eventCount: trip._count?.events ?? 0
  };

  const borderGateId = trip.borderGateId ?? trip.borderGate?.id;
  const yardId = trip.yardId ?? trip.yard?.id;

  if (borderGateId) {
    summary.borderGateId = borderGateId;
  }

  if (yardId) {
    summary.yardId = yardId;
  }

  return summary;
}

export function toTripEventView(event: ApiTripEventWithTrip): OperationsTripEvent {
  const mappedEvent: OperationsTripEvent = {
    id: event.id,
    tripId: event.tripId,
    eventType: event.eventType,
    eventStatus: event.eventStatus,
    source: event.source,
    occurredAt: formatApiDateTime(event.occurredAt),
    recordedAt: formatApiDateTime(event.recordedAt),
    actor: event.createdBy?.fullName ?? event.createdBy?.email ?? 'GateSync',
    note: event.note ?? 'Sự kiện đã được ghi nhận.'
  };

  if (event.trip?.tripCode) {
    mappedEvent.tripCode = event.trip.tripCode;
  }

  if (event.trip?.borderGate?.name) {
    mappedEvent.borderGate = event.trip.borderGate.name;
  }

  if (event.confidence !== undefined && event.confidence !== null) {
    mappedEvent.confidence = Number(event.confidence);
  }

  return mappedEvent;
}

function toAdminMemberView(membership: ApiMembership): AdminMember {
  return {
    id: membership.id,
    name: membership.user?.fullName ?? membership.user?.email ?? 'Thành viên chưa đặt tên',
    email: membership.user?.email ?? 'Chưa cập nhật email',
    role: membership.role,
    status: membership.status,
    lastActiveAt: formatApiDateTime(membership.createdAt)
  };
}

function toAdminVehicleView(vehicle: ApiVehicle): AdminVehicle {
  const tripCount = vehicle._count?.trips ?? 0;
  const defaultDriverId = vehicle.defaultDriverId ?? vehicle.defaultDriver?.id;
  const mappedVehicle: AdminVehicle = {
    id: vehicle.id,
    plateNumber: vehicle.plateNumber,
    vehicleType: vehicle.vehicleType,
    ownershipType: vehicle.ownershipType ?? 'OWNED',
    defaultDriver: vehicle.defaultDriver ? resolveDriverName(vehicle.defaultDriver) : 'Chưa gán',
    currentTrip: tripCount > 0 ? `${tripCount} chuyến đã liên kết` : 'Chưa có chuyến',
    health: tripCount > 0 ? 'Đang theo dõi vận hành' : 'Sẵn sàng phân công'
  };

  if (defaultDriverId) {
    mappedVehicle.defaultDriverId = defaultDriverId;
  }

  return mappedVehicle;
}

function toAdminDriverView(driver: ApiDriverProfile): AdminDriver {
  const assignedVehicleCount = driver._count?.vehicles ?? driver.vehicles?.length ?? 0;
  const activeTripCount = driver._count?.trips ?? 0;

  return {
    id: driver.id,
    name: resolveDriverName(driver),
    phone: driver.phone ?? driver.user?.phone ?? 'Chưa cập nhật',
    licenseNumber: driver.licenseNumber ?? 'Chưa cập nhật',
    assignedVehicle:
      driver.vehicles?.map((vehicle) => vehicle.plateNumber).join(', ') ||
      (assignedVehicleCount > 0 ? `${assignedVehicleCount} xe mặc định` : 'Chưa gán xe'),
    activeTrip: activeTripCount > 0 ? `${activeTripCount} chuyến đã liên kết` : 'Chưa có chuyến',
    identityStatus: driver.userId ? 'Đã liên kết tài khoản' : 'Hồ sơ vận hành nội bộ'
  };
}

function resolveDriverName(driver?: ApiTripSummary['driverProfile'], fallbackName?: string) {
  return (
    driver?.displayName ??
    driver?.user?.fullName ??
    driver?.user?.email ??
    driver?.phone ??
    fallbackName ??
    'Chưa gán tài xế'
  );
}

function calculateDelayMinutes(trip: ApiTripSummary) {
  if (
    !trip.plannedArrivalAt ||
    trip.currentStatus === 'COMPLETED' ||
    trip.currentStatus === 'CANCELLED'
  ) {
    return 0;
  }

  const plannedArrivalAt = new Date(trip.plannedArrivalAt);

  if (Number.isNaN(plannedArrivalAt.getTime())) {
    return 0;
  }

  const minutes = Math.floor((Date.now() - plannedArrivalAt.getTime()) / 60000);
  return minutes > 0 ? minutes : 0;
}

function getTripPriority(trip: ApiTripSummary, delayMinutes: number): OperationsPriority {
  if (trip.currentStatus === 'BLOCKED' || trip.currentStatus === 'DELAYED' || delayMinutes >= 120) {
    return 'HIGH';
  }

  if (
    delayMinutes > 0 ||
    trip.currentStatus === 'WAITING_YARD_ENTRY' ||
    trip.currentStatus === 'INSPECTION_REQUIRED'
  ) {
    return 'MEDIUM';
  }

  return 'NORMAL';
}

function getNextAction(status: TripStatus, delayMinutes: number) {
  if (delayMinutes >= 120) {
    return 'Kiểm tra nguyên nhân chậm và liên hệ đội hiện trường.';
  }

  const actions: Record<TripStatus, string> = {
    PLANNED: 'Theo dõi kế hoạch xuất phát và gán đủ xe, tài xế nếu còn thiếu.',
    IN_PROGRESS: 'Theo dõi xe đến khu vực cửa khẩu và cập nhật mốc đến nơi.',
    WAITING_YARD_ENTRY: 'Xác nhận điều kiện vào bãi hoặc liên hệ bãi để xử lý hàng chờ.',
    IN_YARD: 'Theo dõi xác nhận rời bãi và chuẩn bị mốc vào cửa khẩu.',
    AT_BORDER_GATE: 'Cập nhật mốc vào/ra cửa khẩu theo xác nhận hiện trường.',
    CUSTOMS_PROCESSING: 'Đối chiếu trạng thái tờ khai và cập nhật xử lý hải quan.',
    INSPECTION_REQUIRED: 'Phối hợp chứng từ và hiện trường để cập nhật kết quả kiểm hóa.',
    BLOCKED: 'Xử lý nguyên nhân bị chặn trước khi tiếp tục timeline vận hành.',
    DELAYED: 'Ưu tiên rà soát nguyên nhân chậm và cập nhật sự kiện mới nhất.',
    COMPLETED: 'Chuyến đã hoàn tất, chỉ cần rà soát nếu có hiệu chỉnh.',
    CANCELLED: 'Chuyến đã hủy, không ghi nhận thêm mốc vận hành thường lệ.'
  };

  return actions[status];
}

function formatWeight(value?: string | number | null) {
  if (value === undefined || value === null) {
    return 'Chưa cập nhật';
  }

  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return String(value);
  }

  return `${numericValue.toLocaleString('vi-VN')} kg`;
}
