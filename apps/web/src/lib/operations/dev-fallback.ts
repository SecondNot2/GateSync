import type { TripEventType, TripStatus } from '@gatesync/shared';
import {
  adminDrivers,
  adminMembers,
  adminVehicles,
  demoOrganization,
  demoTrips,
  operationsMetrics,
  operationsStatusGroups,
  recentTripEvents
} from '@/lib/demo-data';
import type { ListTripsParams } from '@/lib/api/types';
import type {
  ApiCuaKhauSoDeclarationSummary,
  ListCuaKhauSoDeclarationsParams
} from '@/lib/api/types';
import type {
  AdminViewData,
  CuaKhauSoViewData,
  DashboardViewData,
  OperationsOrganizationContext,
  OperationsTripDetail,
  OperationsTripEvent,
  OperationsTripSummary,
  TripDetailViewData,
  TripsViewData
} from '@/lib/operations/view-model';

export function getDevDashboardData(reason: string): DashboardViewData {
  const trips = demoTrips.map(toDevTripSummary);

  return {
    organization: toDevOrganization(reason, trips.length),
    metrics: operationsMetrics,
    statusGroups: operationsStatusGroups,
    urgentTrips: trips.filter((trip) => trip.priority !== 'NORMAL' || trip.delayMinutes > 0),
    featuredTrips: trips,
    recentEvents: recentTripEvents.map(toDevTripEvent),
    notice: `Đang dùng dữ liệu mẫu cục bộ: ${reason}`
  };
}

export function getDevTripsData(filters: ListTripsParams, reason: string): TripsViewData {
  const trips = demoTrips.filter((trip) => matchesFilters(trip, filters)).map(toDevTripSummary);

  return {
    organization: toDevOrganization(reason, trips.length),
    trips,
    filters,
    notice: `Đang dùng dữ liệu mẫu cục bộ: ${reason}`
  };
}

export function getDevTripDetailData(tripId: string, reason: string): TripDetailViewData {
  const trip = demoTrips.find((item) => item.id === tripId);

  if (!trip) {
    throw new Error('Không tìm thấy chuyến trong dữ liệu mẫu cục bộ.');
  }

  return {
    organization: toDevOrganization(reason),
    trip: toDevTripDetail(trip),
    notice: `Đang dùng dữ liệu mẫu cục bộ: ${reason}`
  };
}

export function getDevAdminData(reason: string): AdminViewData {
  return {
    organization: toDevOrganization(reason),
    profile: {
      id: 'dev-organization',
      name: demoOrganization.name,
      type: demoOrganization.type,
      taxCode: demoOrganization.taxCode,
      location: demoOrganization.location,
      email: 'ops@gatesync.local',
      phone: '+84988123456',
      currentUserRole: 'OWNER',
      canManageMembers: false,
      canManageFleet: false
    },
    members: adminMembers,
    vehicles: adminVehicles,
    drivers: adminDrivers,
    notice: `Đang dùng dữ liệu mẫu cục bộ: ${reason}`
  };
}

export function getDevCuaKhauSoData(
  filters: ListCuaKhauSoDeclarationsParams,
  reason: string
): CuaKhauSoViewData {
  const declarations = devCuaKhauSoDeclarations.filter((declaration) => {
    if (filters.direction && declaration.direction !== filters.direction) {
      return false;
    }

    if (filters.status === 2 && !declaration.completed) {
      return false;
    }

    if (filters.status === 1 && declaration.completed) {
      return false;
    }

    if (filters.keyword) {
      const keyword = filters.keyword.toLowerCase();
      return `${declaration.declarationNumber} ${declaration.plateNumber} ${declaration.trailerNumber}`
        .toLowerCase()
        .includes(keyword);
    }

    return true;
  });

  return {
    organization: toDevOrganization(reason, declarations.length),
    session: {
      authenticated: false
    },
    declarations: {
      declarations,
      totalCount: declarations.length,
      totalPage: declarations.length > 0 ? 1 : 0,
      message: 'Dữ liệu mẫu Cửa khẩu số chỉ dùng để xem giao diện.'
    },
    notice: `Đang dùng dữ liệu mẫu cục bộ: ${reason}`
  };
}

const devCuaKhauSoDeclarations: ApiCuaKhauSoDeclarationSummary[] = [
  {
    externalId: '84b718cf-4a72-4c7e-91d8-24e51ae53154',
    declarationNumber: '2026050300533',
    createdAt: '2026-05-03T13:15:21.972Z',
    direction: 'IMPORT',
    declarationType: 'IMPORT',
    status: 'SUBMITTED',
    statusLabel: 'Chưa hoàn thành',
    gateName: 'Hữu Nghị',
    gateCode: 'CKHN',
    companyGoodsName: 'CÔNG TY CỔ PHẦN LOGISTICS THÁI VIỆT TRUNG',
    plateNumber: 'FF0666',
    trailerNumber: 'Chưa cập nhật',
    changePlateNumber: 'Không sang tải',
    totalWeight: 3.25,
    completed: false,
    paymentStatus: 'Chưa thanh toán'
  }
];

function toDevOrganization(
  reason: string,
  activeTripCount?: number
): OperationsOrganizationContext {
  const organization: OperationsOrganizationContext = {
    name: demoOrganization.name,
    type: demoOrganization.type,
    controlScore: demoOrganization.controlScore,
    notice: reason
  };

  if (activeTripCount !== undefined) {
    organization.tripBadge = String(activeTripCount);
  }

  return organization;
}

function toDevTripSummary(trip: (typeof demoTrips)[number]): OperationsTripSummary {
  return {
    id: trip.id,
    tripCode: trip.tripCode,
    tripType: trip.tripType,
    direction: trip.direction,
    currentStatus: trip.currentStatus,
    statusUpdatedAt: trip.statusUpdatedAt,
    borderGate: trip.borderGate,
    yard: trip.yard,
    vehicle: {
      plateNumber: trip.vehicle.plateNumber,
      type: trip.vehicle.type
    },
    driver: trip.driver,
    plannedStartAt: trip.plannedStartAt,
    plannedArrivalAt: trip.plannedArrivalAt,
    delayMinutes: trip.delayMinutes,
    statusDurationMinutes: 0,
    priority: trip.priority,
    nextAction: trip.nextAction,
    nextActionLabel: 'Việc cần làm tiếp theo',
    exceptionCodes: getDevExceptionCodes(trip.currentStatus, trip.delayMinutes),
    availableManualActions: getDevManualActions(trip.currentStatus),
    eventCount: trip.events.length
  };
}

function toDevTripDetail(trip: (typeof demoTrips)[number]): OperationsTripDetail {
  return {
    ...toDevTripSummary(trip),
    shipment: trip.shipment,
    declaration: trip.declaration,
    participants: trip.participants.map((participant) => ({
      id: participant,
      label: participant,
      role: 'VIEWER',
      visibilityLevel: 'OPERATIONAL'
    })),
    events: trip.events.map((event) =>
      toDevTripEvent({
        ...event,
        tripId: trip.id,
        tripCode: trip.tripCode,
        borderGate: trip.borderGate
      })
    )
  };
}

function toDevTripEvent(event: (typeof recentTripEvents)[number]): OperationsTripEvent {
  const mappedEvent: OperationsTripEvent = {
    id: event.id,
    tripId: event.tripId,
    tripCode: event.tripCode,
    borderGate: event.borderGate,
    eventType: event.eventType,
    eventStatus: event.eventStatus,
    source: event.source,
    occurredAt: event.occurredAt,
    recordedAt: event.recordedAt,
    actor: event.actor,
    note: event.note
  };

  if (event.confidence !== undefined) {
    mappedEvent.confidence = event.confidence;
  }

  return mappedEvent;
}

function matchesFilters(trip: (typeof demoTrips)[number], filters: ListTripsParams) {
  const query = filters.search?.trim().toLowerCase();

  if (filters.status && trip.currentStatus !== filters.status) {
    return false;
  }

  if (filters.borderGateId && trip.borderGate !== filters.borderGateId) {
    return false;
  }

  if (filters.yardId && trip.yard !== filters.yardId) {
    return false;
  }

  if (filters.exception && !matchesExceptionFilter(trip, filters.exception)) {
    return false;
  }

  if (!query) {
    return true;
  }

  return [
    trip.tripCode,
    trip.vehicle.plateNumber,
    trip.driver.name,
    trip.driver.phone,
    trip.borderGate,
    trip.yard
  ].some((value) => value.toLowerCase().includes(query));
}

function getDevExceptionCodes(
  status: TripStatus,
  delayMinutes: number
): OperationsTripSummary['exceptionCodes'] {
  const exceptionCodes: OperationsTripSummary['exceptionCodes'] = [];

  if (delayMinutes > 0) {
    exceptionCodes.push('ARRIVAL_OVERDUE');
  }

  if (status === 'BLOCKED') {
    exceptionCodes.push('BLOCKED');
  }

  if (status === 'DELAYED') {
    exceptionCodes.push('DELAYED_STATUS');
  }

  if (status === 'INSPECTION_REQUIRED') {
    exceptionCodes.push('INSPECTION_REQUIRED');
  }

  if (status === 'WAITING_YARD_ENTRY') {
    exceptionCodes.push('WAITING_YARD');
  }

  return exceptionCodes;
}

function getDevManualActions(status: TripStatus): TripEventType[] {
  const actions: Record<TripStatus, TripEventType[]> = {
    PLANNED: ['DEPARTED', 'TRIP_CANCELLED'],
    IN_PROGRESS: ['ARRIVED_BORDER_AREA', 'WAITING_YARD_ENTRY', 'DRIVER_NOTE_ADDED'],
    WAITING_YARD_ENTRY: ['YARD_ENTRY_CONFIRMED', 'DRIVER_REPORTED_YARD_ENTRY'],
    IN_YARD: ['YARD_EXIT_CONFIRMED', 'DECLARATION_SUBMITTED'],
    AT_BORDER_GATE: ['BORDER_GATE_ENTRY_CONFIRMED', 'DECLARATION_SUBMITTED', 'CUSTOMS_PROCESSING'],
    CUSTOMS_PROCESSING: ['DECLARATION_APPROVED', 'INSPECTION_REQUIRED', 'FEE_PAID'],
    INSPECTION_REQUIRED: ['INSPECTION_COMPLETED', 'DECLARATION_APPROVED'],
    BLOCKED: ['DRIVER_NOTE_ADDED', 'DECLARATION_APPROVED', 'TRIP_CANCELLED'],
    DELAYED: ['DRIVER_NOTE_ADDED', 'ARRIVED_BORDER_AREA', 'YARD_ENTRY_CONFIRMED'],
    COMPLETED: [],
    CANCELLED: []
  };

  return actions[status];
}

function matchesExceptionFilter(
  trip: (typeof demoTrips)[number],
  exception: NonNullable<ListTripsParams['exception']>
) {
  if (exception === 'ATTENTION') {
    return trip.priority !== 'NORMAL' || trip.delayMinutes > 0;
  }

  if (exception === 'DELAYED') {
    return trip.delayMinutes > 0 || trip.currentStatus === 'DELAYED';
  }

  if (exception === 'BLOCKED') {
    return trip.currentStatus === 'BLOCKED';
  }

  if (exception === 'STALE') {
    return trip.delayMinutes > 0;
  }

  if (exception === 'INSPECTION') {
    return trip.currentStatus === 'INSPECTION_REQUIRED';
  }

  return trip.currentStatus === 'WAITING_YARD_ENTRY';
}

export const filterableStatuses: TripStatus[] = [
  'PLANNED',
  'IN_PROGRESS',
  'WAITING_YARD_ENTRY',
  'IN_YARD',
  'AT_BORDER_GATE',
  'CUSTOMS_PROCESSING',
  'INSPECTION_REQUIRED',
  'BLOCKED',
  'DELAYED',
  'COMPLETED',
  'CANCELLED'
];
