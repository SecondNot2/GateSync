import {
  tripExceptionFilters,
  tripStatuses,
  type TripExceptionFilter,
  type TripStatus
} from '@gatesync/shared';
import type { ListTripsParams } from '@/lib/api/types';

export type TripsSearchParams = Record<string, string | string[] | undefined>;

const defaultTripWindowDays = 7;

export function toTripFilters(searchParams: URLSearchParams): ListTripsParams {
  const filters: ListTripsParams = {
    limit: 50,
    from: getDefaultTripFromIso(),
    to: getDefaultTripToIso()
  };
  const search = searchParams.get('search')?.trim();
  const status = searchParams.get('status');
  const borderGateId = searchParams.get('borderGateId')?.trim();
  const yardId = searchParams.get('yardId')?.trim();
  const driverProfileId = searchParams.get('driverProfileId')?.trim();
  const vehicleId = searchParams.get('vehicleId')?.trim();
  const cargoOwnerOrganizationId = searchParams.get('cargoOwnerOrganizationId')?.trim();
  const exception = searchParams.get('exception');
  const from = searchParams.get('from')?.trim();
  const to = searchParams.get('to')?.trim();

  if (search) {
    filters.search = search;
  }

  if (isTripStatus(status)) {
    filters.status = status;
  }

  if (borderGateId) {
    filters.borderGateId = borderGateId;
  }

  if (yardId) {
    filters.yardId = yardId;
  }

  if (driverProfileId) {
    filters.driverProfileId = driverProfileId;
  }

  if (vehicleId) {
    filters.vehicleId = vehicleId;
  }

  if (cargoOwnerOrganizationId) {
    filters.cargoOwnerOrganizationId = cargoOwnerOrganizationId;
  }

  if (isTripExceptionFilter(exception)) {
    filters.exception = exception;
  }

  if (from) {
    filters.from = from;
  }

  if (to) {
    filters.to = to;
  }

  return filters;
}

export function toUrlSearchParams(searchParams: TripsSearchParams = {}) {
  const params = new URLSearchParams();

  Object.entries(searchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      const firstValue = value[0];

      if (firstValue) {
        params.set(key, firstValue);
      }

      return;
    }

    if (value) {
      params.set(key, value);
    }
  });

  return params;
}

export function countActiveTripFilters(filters: ListTripsParams) {
  return [
    filters.search,
    filters.status,
    filters.borderGateId,
    filters.yardId,
    filters.driverProfileId,
    filters.vehicleId,
    filters.cargoOwnerOrganizationId,
    filters.exception,
    filters.from,
    filters.to
  ].filter(Boolean).length;
}

export function hasAdvancedTripFilters(filters: ListTripsParams) {
  return Boolean(
    filters.borderGateId ||
    filters.yardId ||
    filters.driverProfileId ||
    filters.vehicleId ||
    filters.cargoOwnerOrganizationId
  );
}

export function isTripStatus(value: string | null): value is TripStatus {
  return tripStatuses.some((status) => status === value);
}

export function isTripExceptionFilter(value: string | null): value is TripExceptionFilter {
  return tripExceptionFilters.some((filter) => filter === value);
}

function getDefaultTripFromIso() {
  const date = new Date();
  date.setDate(date.getDate() - defaultTripWindowDays);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function getDefaultTripToIso() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}
