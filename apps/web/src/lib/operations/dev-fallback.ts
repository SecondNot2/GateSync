import type { TripStatus } from '@gatesync/shared';
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
  AdminViewData,
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
    priority: trip.priority,
    nextAction: trip.nextAction,
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
