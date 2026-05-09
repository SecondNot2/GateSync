import { BadRequestException, Injectable } from '@nestjs/common';
import type { TripEventType, TripStatus } from '@prisma/client';

const eventStatusProjection: Partial<Record<string, TripStatus>> = {
  TRIP_CREATED: 'PLANNED',
  DEPARTED: 'IN_PROGRESS',
  ARRIVED_BORDER_AREA: 'AT_BORDER_GATE',
  WAITING_YARD_ENTRY: 'WAITING_YARD_ENTRY',
  YARD_ENTRY_CONFIRMED: 'IN_YARD',
  DRIVER_REPORTED_YARD_ENTRY: 'IN_YARD',
  YARD_EXIT_CONFIRMED: 'AT_BORDER_GATE',
  DRIVER_REPORTED_GATE_ENTRY: 'AT_BORDER_GATE',
  DECLARATION_SUBMITTED: 'CUSTOMS_PROCESSING',
  DECLARATION_APPROVED: 'CUSTOMS_PROCESSING',
  DECLARATION_REJECTED: 'BLOCKED',
  BORDER_GATE_ENTRY_CONFIRMED: 'AT_BORDER_GATE',
  CUSTOMS_PROCESSING: 'CUSTOMS_PROCESSING',
  INSPECTION_REQUIRED: 'INSPECTION_REQUIRED',
  INSPECTION_COMPLETED: 'CUSTOMS_PROCESSING',
  BORDER_GATE_EXIT_CONFIRMED: 'COMPLETED',
  VEHICLE_RELEASED: 'COMPLETED',
  TRIP_CANCELLED: 'CANCELLED',
  TRIP_COMPLETED: 'COMPLETED'
};

const allowedTransitions: Record<TripStatus, readonly TripStatus[]> = {
  PLANNED: [
    'PLANNED',
    'IN_PROGRESS',
    'WAITING_YARD_ENTRY',
    'IN_YARD',
    'AT_BORDER_GATE',
    'CUSTOMS_PROCESSING',
    'INSPECTION_REQUIRED',
    'BLOCKED',
    'COMPLETED',
    'CANCELLED'
  ],
  IN_PROGRESS: [
    'IN_PROGRESS',
    'WAITING_YARD_ENTRY',
    'AT_BORDER_GATE',
    'CUSTOMS_PROCESSING',
    'INSPECTION_REQUIRED',
    'BLOCKED',
    'COMPLETED',
    'CANCELLED'
  ],
  WAITING_YARD_ENTRY: ['WAITING_YARD_ENTRY', 'IN_YARD', 'AT_BORDER_GATE', 'BLOCKED', 'CANCELLED'],
  IN_YARD: ['IN_YARD', 'AT_BORDER_GATE', 'CUSTOMS_PROCESSING', 'BLOCKED', 'COMPLETED', 'CANCELLED'],
  AT_BORDER_GATE: [
    'AT_BORDER_GATE',
    'IN_YARD',
    'CUSTOMS_PROCESSING',
    'INSPECTION_REQUIRED',
    'BLOCKED',
    'COMPLETED',
    'CANCELLED'
  ],
  CUSTOMS_PROCESSING: [
    'CUSTOMS_PROCESSING',
    'INSPECTION_REQUIRED',
    'AT_BORDER_GATE',
    'BLOCKED',
    'COMPLETED',
    'CANCELLED'
  ],
  INSPECTION_REQUIRED: [
    'INSPECTION_REQUIRED',
    'CUSTOMS_PROCESSING',
    'AT_BORDER_GATE',
    'BLOCKED',
    'COMPLETED',
    'CANCELLED'
  ],
  BLOCKED: [
    'IN_PROGRESS',
    'WAITING_YARD_ENTRY',
    'IN_YARD',
    'AT_BORDER_GATE',
    'CUSTOMS_PROCESSING',
    'INSPECTION_REQUIRED',
    'BLOCKED',
    'COMPLETED',
    'CANCELLED'
  ],
  DELAYED: [
    'IN_PROGRESS',
    'WAITING_YARD_ENTRY',
    'IN_YARD',
    'AT_BORDER_GATE',
    'CUSTOMS_PROCESSING',
    'INSPECTION_REQUIRED',
    'BLOCKED',
    'COMPLETED',
    'CANCELLED'
  ],
  COMPLETED: [],
  CANCELLED: []
};

@Injectable()
export class TripStateTransitionService {
  getProjectedStatus(eventType: TripEventType): TripStatus | undefined {
    return eventStatusProjection[eventType];
  }

  assertCanApplyEvent(currentStatus: TripStatus, eventType: TripEventType): TripStatus | undefined {
    const nextStatus = this.getProjectedStatus(eventType);

    if (!nextStatus) {
      return undefined;
    }

    if (!allowedTransitions[currentStatus].includes(nextStatus)) {
      throw new BadRequestException(
        `Trip event ${eventType} cannot transition trip from ${currentStatus} to ${nextStatus}.`
      );
    }

    return nextStatus;
  }
}
