import assert from 'node:assert/strict';
import test from 'node:test';
import { TripOperationsService } from './trip-operations.service';

const service = new TripOperationsService();
const now = new Date('2026-05-04T12:00:00.000Z');

test('calculates delay from planned arrival and stale status duration', () => {
  const delayedByArrival = service.getOperationalState(
    {
      currentStatus: 'IN_PROGRESS',
      currentStatusUpdatedAt: '2026-05-04T06:00:00.000Z',
      plannedArrivalAt: '2026-05-04T09:30:00.000Z'
    },
    now
  );
  const staleWaitingYard = service.getOperationalState(
    {
      currentStatus: 'WAITING_YARD_ENTRY',
      currentStatusUpdatedAt: '2026-05-04T10:30:00.000Z',
      plannedArrivalAt: '2026-05-04T13:00:00.000Z'
    },
    now
  );

  assert.equal(delayedByArrival.delayMinutes, 150);
  assert.equal(delayedByArrival.priority, 'HIGH');
  assert.deepEqual(delayedByArrival.exceptionCodes, ['ARRIVAL_OVERDUE', 'STATUS_STALE']);
  assert.equal(staleWaitingYard.delayMinutes, 45);
  assert.equal(staleWaitingYard.priority, 'MEDIUM');
  assert.deepEqual(staleWaitingYard.exceptionCodes, ['STATUS_STALE', 'WAITING_YARD']);
});

test('maps current status and latest event to next operational action', () => {
  const customsState = service.getOperationalState(
    {
      currentStatus: 'CUSTOMS_PROCESSING',
      currentStatusUpdatedAt: '2026-05-04T11:30:00.000Z',
      events: [
        {
          eventType: 'INSPECTION_COMPLETED',
          occurredAt: '2026-05-04T11:45:00.000Z'
        }
      ]
    },
    now
  );
  const yardState = service.getOperationalState(
    {
      currentStatus: 'WAITING_YARD_ENTRY',
      currentStatusUpdatedAt: '2026-05-04T11:40:00.000Z'
    },
    now
  );

  assert.equal(customsState.nextAction.code, 'PAY_FEE');
  assert.deepEqual(customsState.nextAction.suggestedEventTypes, [
    'FEE_PAID',
    'BORDER_GATE_EXIT_CONFIRMED',
    'TRIP_COMPLETED'
  ]);
  assert.equal(yardState.nextAction.code, 'CONFIRM_YARD_ENTRY');
  assert.deepEqual(yardState.nextAction.suggestedEventTypes, [
    'YARD_ENTRY_CONFIRMED',
    'DRIVER_REPORTED_YARD_ENTRY'
  ]);
});

test('groups and sorts delayed trips before normal operations', () => {
  const trips = service.enrichTrips(
    [
      {
        id: 'normal-trip',
        currentStatus: 'IN_PROGRESS' as const,
        currentStatusUpdatedAt: '2026-05-04T11:30:00.000Z',
        plannedArrivalAt: '2026-05-04T13:00:00.000Z'
      },
      {
        id: 'blocked-trip',
        currentStatus: 'BLOCKED' as const,
        currentStatusUpdatedAt: '2026-05-04T11:50:00.000Z',
        plannedArrivalAt: '2026-05-04T13:00:00.000Z'
      },
      {
        id: 'late-trip',
        currentStatus: 'IN_PROGRESS' as const,
        currentStatusUpdatedAt: '2026-05-04T10:00:00.000Z',
        plannedArrivalAt: '2026-05-04T10:00:00.000Z'
      }
    ],
    now
  );
  const sortedTrips = service.sortTripsForOperations(trips);
  const delaySummary = service.createDelaySummary(trips);

  assert.deepEqual(
    sortedTrips.map((trip) => trip.id),
    ['late-trip', 'blocked-trip', 'normal-trip']
  );
  assert.equal(delaySummary.delayedTrips, 2);
  assert.equal(delaySummary.blockedTrips, 1);
  assert.equal(delaySummary.longestDelayMinutes, 120);
});
