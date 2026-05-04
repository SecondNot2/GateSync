import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../auth/request-user';
import type { CreateTripEventDto } from './dto/create-trip-event.dto';
import type { CreateTripDto } from './dto/create-trip.dto';
import type { ListTripsQueryDto } from './dto/list-trips-query.dto';
import { TripOperationsService } from './trip-operations.service';
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
  return new TripsService(
    prisma as PrismaService,
    new TripOperationsService(),
    new TripStateTransitionService()
  );
}

test('listTrips applies Sprint 3 filters and search with tenant scope', async () => {
  type CapturedFindManyArgs = {
    where?: Record<string, unknown>;
    take?: number;
    skip?: number;
    cursor?: {
      id: string;
    };
  };
  let findArgs: CapturedFindManyArgs | undefined;
  const prisma = {
    trip: {
      findMany: async (args: CapturedFindManyArgs) => {
        findArgs = args;
        return [];
      }
    }
  };
  const service = createService(prisma);
  const query: ListTripsQueryDto = {
    search: '29H',
    status: 'IN_YARD',
    borderGateId: '00000000-0000-4000-8000-000000000014',
    yardId: '00000000-0000-4000-8000-000000000015',
    driverProfileId: '00000000-0000-4000-8000-000000000011',
    vehicleId: '00000000-0000-4000-8000-000000000010',
    cargoOwnerOrganizationId: '00000000-0000-4000-8000-000000000016',
    from: '2026-05-01T00:00:00.000Z',
    to: '2026-05-31T23:59:59.999Z',
    limit: 25,
    cursor: 'trip-cursor'
  };

  await service.listTrips('org-1', query);

  const where = findArgs?.where as {
    organizationId: string;
    deletedAt: null;
    currentStatus: string;
    borderGateId: string;
    yardId: string;
    driverProfileId: string;
    vehicleId: string;
    shipment: {
      is: {
        cargoOwnerOrganizationId: string;
      };
    };
    plannedStartAt: {
      gte?: Date;
      lte?: Date;
    };
    OR: Array<Record<string, unknown>>;
  };
  assert.equal(findArgs?.take, 25);
  assert.equal(findArgs?.skip, 1);
  assert.deepEqual(findArgs?.cursor, { id: 'trip-cursor' });
  assert.equal(where.organizationId, 'org-1');
  assert.equal(where.deletedAt, null);
  assert.equal(where.currentStatus, 'IN_YARD');
  assert.equal(where.borderGateId, query.borderGateId);
  assert.equal(where.yardId, query.yardId);
  assert.equal(where.driverProfileId, query.driverProfileId);
  assert.equal(where.vehicleId, query.vehicleId);
  assert.equal(where.shipment.is.cargoOwnerOrganizationId, query.cargoOwnerOrganizationId);
  assert.equal(where.plannedStartAt.gte?.toISOString(), query.from);
  assert.equal(where.plannedStartAt.lte?.toISOString(), query.to);
  assert.equal(where.OR.length, 7);
  assert.deepEqual(where.OR[0], {
    tripCode: {
      contains: '29H',
      mode: 'insensitive'
    }
  });
});

test('listTrips paginates after operational exception filtering', async () => {
  type CapturedFindManyArgs = {
    where?: Record<string, unknown>;
    take?: number;
    skip?: number;
    cursor?: {
      id: string;
    };
  };
  const now = Date.now();
  let findArgs: CapturedFindManyArgs | undefined;
  const prisma = {
    trip: {
      findMany: async (args: CapturedFindManyArgs) => {
        findArgs = args;
        return [
          {
            id: 'normal-trip',
            currentStatus: 'IN_PROGRESS',
            currentStatusUpdatedAt: new Date(now - 10 * 60 * 1000),
            plannedArrivalAt: new Date(now + 60 * 60 * 1000)
          },
          {
            id: 'late-trip-1',
            currentStatus: 'IN_PROGRESS',
            currentStatusUpdatedAt: new Date(now - 60 * 60 * 1000),
            plannedArrivalAt: new Date(now - 180 * 60 * 1000)
          },
          {
            id: 'late-trip-2',
            currentStatus: 'IN_PROGRESS',
            currentStatusUpdatedAt: new Date(now - 60 * 60 * 1000),
            plannedArrivalAt: new Date(now - 120 * 60 * 1000)
          }
        ];
      }
    }
  };
  const service = createService(prisma);

  const trips = await service.listTrips('org-1', {
    exception: 'DELAYED',
    cursor: 'late-trip-1',
    limit: 1
  });

  assert.equal(findArgs?.take, undefined);
  assert.equal(findArgs?.skip, undefined);
  assert.equal(findArgs?.cursor, undefined);
  assert.deepEqual(
    trips.map((trip) => trip.id),
    ['late-trip-2']
  );
});

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
  let notificationCreateData: Array<Record<string, unknown>> | undefined;
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
    },
    membership: {
      findMany: async () => [
        {
          userId: 'user-1'
        },
        {
          userId: 'user-2'
        }
      ]
    },
    notification: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        notificationCreateData = data;
        return { count: data.length };
      }
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
  assert.equal(notificationCreateData?.length, 2);
  assert.equal(notificationCreateData?.[0]?.channel, 'IN_APP');
  assert.deepEqual(notificationCreateData?.[0]?.payload, {
    kind: 'trip_event',
    eventId: 'event-1',
    eventType: 'DEPARTED',
    currentStatus: 'IN_PROGRESS',
    occurredAt: '2026-05-04T00:00:00.000Z'
  });
});

test('listEvents does not expose raw payload data', async () => {
  let eventFindManyArgs: { select?: Record<string, unknown> } | undefined;
  const prisma = {
    trip: {
      findFirst: async () => ({
        id: 'trip-1'
      })
    },
    tripEvent: {
      findMany: async (args: { select?: Record<string, unknown> }) => {
        eventFindManyArgs = args;
        return [];
      }
    }
  };
  const service = createService(prisma);

  await service.listEvents('org-1', 'trip-1');

  assert.equal(eventFindManyArgs?.select?.id, true);
  assert.equal(eventFindManyArgs?.select?.rawPayload, undefined);
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
