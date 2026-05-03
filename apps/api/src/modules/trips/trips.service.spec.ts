import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../auth/request-user';
import type { CreateTripEventDto } from './dto/create-trip-event.dto';
import type { CreateTripDto } from './dto/create-trip.dto';
import { TripStateTransitionService } from './trip-state-transition.service';
import { TripsService } from './trips.service';

const requestUser: RequestUser = {
  id: 'user-1',
  supabaseUserId: 'supabase-user-1',
  claims: {},
  memberships: [
    {
      id: 'membership-1',
      organizationId: 'org-1',
      role: 'DISPATCHER',
      status: 'ACTIVE'
    }
  ]
};

function createService(prisma: unknown): TripsService {
  return new TripsService(prisma as PrismaService, new TripStateTransitionService());
}

test('createTrip creates a trip, owner participant, TRIP_CREATED event and audit in one transaction', async () => {
  const createdParticipants: Record<string, unknown>[] = [];
  const createdEvents: Record<string, unknown>[] = [];
  const createdAuditLogs: Record<string, unknown>[] = [];
  const tx = {
    trip: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'trip-1',
        organizationId: data.organizationId,
        tripCode: data.tripCode,
        tripType: data.tripType,
        direction: data.direction,
        currentStatus: data.currentStatus
      }),
      findUniqueOrThrow: async () => ({
        id: 'trip-1',
        organizationId: 'org-1',
        tripCode: 'GS-0001',
        participants: []
      })
    },
    tripParticipant: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdParticipants.push(data);
        return data;
      }
    },
    tripEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdEvents.push(data);
        return {
          id: 'event-1',
          ...data
        };
      }
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdAuditLogs.push(data);
        return data;
      }
    }
  };
  const prisma = {
    $transaction: async (callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)
  };
  const service = createService(prisma);
  const dto: CreateTripDto = {
    tripCode: 'GS-0001',
    tripType: 'EXPORT_WITH_GOODS'
  };

  const trip = await service.createTrip(requestUser, 'org-1', dto);

  assert.equal(trip.id, 'trip-1');
  assert.equal(createdParticipants.length, 1);
  assert.equal(createdParticipants[0]?.role, 'OWNER_ORG');
  assert.equal(createdEvents.length, 1);
  assert.equal(createdEvents[0]?.eventType, 'TRIP_CREATED');
  assert.equal(createdEvents[0]?.source, 'SYSTEM');
  assert.equal(createdAuditLogs[0]?.action, 'trip.create');
});

test('createEvent applies a valid transition and stores idempotency key', async () => {
  let tripFindWhere: Record<string, unknown> | undefined;
  let tripUpdateData: Record<string, unknown> | undefined;
  let eventCreateData: Record<string, unknown> | undefined;
  const tx = {
    trip: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        tripFindWhere = where;
        return {
          id: 'trip-1',
          currentStatus: 'PLANNED'
        };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        tripUpdateData = data;
        return data;
      }
    },
    tripEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        eventCreateData = data;
        return {
          id: 'event-1',
          organizationId: 'org-1',
          tripId: 'trip-1',
          ...data
        };
      }
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => data
    }
  };
  const prisma = {
    tripEvent: {
      findUnique: async () => null
    },
    $transaction: async (callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)
  };
  const service = createService(prisma);
  const dto: CreateTripEventDto = {
    eventType: 'DEPARTED',
    occurredAt: '2026-05-04T00:00:00.000Z'
  };

  const event = await service.createEvent(requestUser, 'org-1', 'trip-1', dto, 'manual-event-1');

  assert.equal(event.id, 'event-1');
  assert.deepEqual(tripFindWhere, {
    id: 'trip-1',
    organizationId: 'org-1',
    deletedAt: null
  });
  assert.equal(tripUpdateData?.currentStatus, 'IN_PROGRESS');
  assert.equal(eventCreateData?.idempotencyKey, 'manual-event-1');
});

test('createEvent returns the existing event for duplicate idempotency key in the same trip', async () => {
  let transactionCalled = false;
  const existingEvent = {
    id: 'event-existing',
    organizationId: 'org-1',
    tripId: 'trip-1',
    eventType: 'DEPARTED'
  };
  const prisma = {
    tripEvent: {
      findUnique: async () => existingEvent
    },
    $transaction: async () => {
      transactionCalled = true;
      return undefined;
    }
  };
  const service = createService(prisma);
  const dto: CreateTripEventDto = {
    eventType: 'DEPARTED',
    occurredAt: '2026-05-04T00:00:00.000Z'
  };

  const event = await service.createEvent(requestUser, 'org-1', 'trip-1', dto, 'manual-event-1');

  assert.equal(event.id, 'event-existing');
  assert.equal(transactionCalled, false);
});

test('createEvent checks the trip belongs to the organization before writing event data', async () => {
  let tripFindWhere: Record<string, unknown> | undefined;
  let eventCreated = false;
  const tx = {
    trip: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        tripFindWhere = where;
        return null;
      }
    },
    tripEvent: {
      create: async () => {
        eventCreated = true;
        return undefined;
      }
    },
    auditLog: {
      create: async () => undefined
    }
  };
  const prisma = {
    tripEvent: {
      findUnique: async () => null
    },
    $transaction: async (callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)
  };
  const service = createService(prisma);
  const dto: CreateTripEventDto = {
    eventType: 'DEPARTED',
    occurredAt: '2026-05-04T00:00:00.000Z'
  };

  await assert.rejects(
    async () => service.createEvent(requestUser, 'org-2', 'trip-1', dto, 'manual-event-1'),
    NotFoundException
  );
  assert.deepEqual(tripFindWhere, {
    id: 'trip-1',
    organizationId: 'org-2',
    deletedAt: null
  });
  assert.equal(eventCreated, false);
});
