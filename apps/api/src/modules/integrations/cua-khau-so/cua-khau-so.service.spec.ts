import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { ConfigService } from '@nestjs/config';
import type { RequestUser } from '../../auth/request-user';
import type { OperationsCacheService } from '../../cache/operations-cache.service';
import type { NotificationsService } from '../../notifications/notifications.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TripsService } from '../../trips/trips.service';
import { CuaKhauSoMapper } from './cua-khau-so.mapper';
import { CuaKhauSoService } from './cua-khau-so.service';
import { CuaKhauSoSessionStore } from './cua-khau-so-session.store';
import type { CuaKhauSoClient } from './cua-khau-so.client';
import type { CuaKhauSoDeclarationDetail, CuaKhauSoDeclarationSummary } from './cua-khau-so.types';

const requestUser: RequestUser = {
  id: '00000000-0000-4000-8000-000000000002',
  supabaseUserId: 'supabase-user-1',
  claims: {},
  memberships: [
    {
      id: 'membership-1',
      organizationId: '00000000-0000-4000-8000-000000000001',
      role: 'DOCUMENT_STAFF',
      status: 'ACTIVE'
    }
  ]
};

function loadFixture(): CuaKhauSoDeclarationDetail {
  const raw = JSON.parse(
    readFileSync(
      path.resolve(
        process.cwd(),
        'src/modules/integrations/cua-khau-so/__fixtures__/raw-json.json'
      ),
      'utf8'
    )
  ) as { data: CuaKhauSoDeclarationDetail };

  return raw.data;
}

function createService(params: {
  prisma: unknown;
  client: unknown;
  tripsService?: unknown;
  notificationsService?: unknown;
  sessionStore?: CuaKhauSoSessionStore;
}) {
  return new CuaKhauSoService(
    params.prisma as PrismaService,
    {
      get: () => undefined
    } as unknown as ConfigService,
    params.client as CuaKhauSoClient,
    new CuaKhauSoMapper(),
    params.sessionStore ?? new CuaKhauSoSessionStore(),
    (params.notificationsService ?? {
      createCuaKhauSoDocumentStaffNotifications: async () => undefined
    }) as NotificationsService,
    {
      makeCuaKhauSoDeclarationsKey: (_organizationId: string, filterHash: string) =>
        `cks:${filterHash}`,
      cksDeclarationsTtlMs: () => 90_000,
      getOrSet: async <T>(_key: string, _ttlMs: number, factory: () => Promise<T>) => factory(),
      invalidateCuaKhauSoReadModels: async () => undefined
    } as unknown as OperationsCacheService,
    (params.tripsService ?? {}) as TripsService
  );
}

test('connect stores a server-side Cửa khẩu số session without returning source tokens', async () => {
  let auditData: Record<string, unknown> | undefined;
  let accountUpsertData: Record<string, unknown> | undefined;
  const prisma = {
    integrationAccount: {
      upsert: async (args: Record<string, unknown>) => {
        accountUpsertData = args;
        return {
          id: 'account-1'
        };
      }
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditData = data;
        return data;
      }
    }
  };
  const client = {
    login: async () => ({
      accessToken: 'source-token',
      refreshCookies: ['refresh-cookie=value'],
      username: 'source-user'
    })
  };
  const service = createService({ prisma, client });

  const result = await service.connect(requestUser, '00000000-0000-4000-8000-000000000001', {
    username: 'source-user',
    password: 'secret'
  });

  assert.equal(result.authenticated, true);
  assert.equal('accessToken' in result, false);
  assert.equal(accountUpsertData !== undefined, true);
  assert.equal(auditData?.action, 'integration.cua_khau_so.connect');
});

test('listDeclarations reads the internal mirror without requiring a live source session', async () => {
  let findManyArgs: Record<string, unknown> | undefined;
  const observedAt = new Date('2026-05-03T13:20:21.972Z');
  const service = createService({
    prisma: {
      integrationAccount: {
        findFirst: async () => null
      },
      customsDeclaration: {
        findMany: async (args: Record<string, unknown>) => {
          findManyArgs = args;
          return [
            {
              id: '00000000-0000-4000-8000-000000000013',
              declarationNumber: '2026050300533',
              declarationType: 'IMPORT',
              customsOfficeCode: 'CKHN',
              status: 'SUBMITTED',
              sourceExternalId: '84b718cf-4a72-4c7e-91d8-24e51ae53154',
              sourceStatus: 'Chưa hoàn thành',
              sourceUpdatedAt: observedAt,
              sourceObservedAt: observedAt,
              lastIngestedAt: observedAt,
              submittedAt: observedAt,
              normalizedSummary: {
                externalId: '84b718cf-4a72-4c7e-91d8-24e51ae53154',
                declarationNumber: '2026050300533',
                createdAt: observedAt.toISOString(),
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
              },
              sourceSnapshot: null,
              trips: [
                {
                  id: '00000000-0000-4000-8000-000000000020',
                  tripCode: 'GS-IMPORT-001',
                  currentStatus: 'AT_BORDER_GATE'
                }
              ]
            }
          ];
        }
      }
    },
    client: {}
  });

  const result = await service.listDeclarations(
    requestUser,
    '00000000-0000-4000-8000-000000000001',
    {
      pageNumber: 1,
      pageSize: 20,
      status: 1,
      keyword: 'FF0666'
    } as never
  );

  assert.equal(result.totalCount, 1);
  assert.equal(result.declarations[0]?.declarationNumber, '2026050300533');
  assert.equal(result.declarations[0]?.sourceObservedAt, observedAt.toISOString());
  assert.equal(result.declarations[0]?.linkedTripCode, 'GS-IMPORT-001');
  assert.equal(findManyArgs !== undefined, true);
});

test('getHealth reports unconfigured and configured Cửa khẩu số sync state', async () => {
  const healthySyncAt = new Date();
  const unconfiguredService = createService({
    prisma: {
      integrationAccount: {
        findFirst: async () => null
      }
    },
    client: {}
  });
  const configuredService = createService({
    prisma: {
      integrationAccount: {
        findFirst: async () => ({
          status: 'ACTIVE',
          lastSyncAt: healthySyncAt,
          lastSuccessfulSyncAt: healthySyncAt,
          lastDetailRefreshedAt: healthySyncAt,
          lastErrorAt: null,
          nextRetryAt: null,
          syncLagSeconds: 0,
          consecutiveFailures: 0,
          lastErrorMessage: null
        })
      }
    },
    client: {}
  });

  const unconfigured = await unconfiguredService.getHealth('00000000-0000-4000-8000-000000000001');
  const configured = await configuredService.getHealth('00000000-0000-4000-8000-000000000001');

  assert.equal(unconfigured.configured, false);
  assert.equal(unconfigured.status, 'NOT_CONFIGURED');
  assert.equal(configured.configured, true);
  assert.equal(configured.stale, false);
  assert.equal(configured.lastSuccessfulSyncAt, healthySyncAt.toISOString());
});

test('auto sync window only includes unfinished recent Cửa khẩu số declarations', () => {
  const service = createService({
    prisma: {},
    client: {}
  });
  const serviceInternals = service as unknown as {
    matchesAutoSyncWindow: (declaration: CuaKhauSoDeclarationSummary, from: Date) => boolean;
  };
  const from = new Date('2026-05-01T00:00:00.000Z');
  const baseDeclaration: CuaKhauSoDeclarationSummary = {
    externalId: 'external-1',
    declarationNumber: '2026050300533',
    createdAt: '2026-05-03T00:00:00.000Z',
    direction: 'IMPORT',
    declarationType: 'IMPORT',
    status: 'SUBMITTED',
    statusLabel: 'Chưa hoàn thành',
    gateName: 'Hữu Nghị',
    companyGoodsName: 'CÔNG TY CỔ PHẦN LOGISTICS THÁI VIỆT TRUNG',
    plateNumber: 'FF0666',
    trailerNumber: 'Chưa cập nhật',
    changePlateNumber: 'Không sang tải',
    completed: false,
    paymentStatus: 'Chưa thanh toán'
  };

  assert.equal(serviceInternals.matchesAutoSyncWindow(baseDeclaration, from), true);
  assert.equal(
    serviceInternals.matchesAutoSyncWindow(
      {
        ...baseDeclaration,
        completed: true
      },
      from
    ),
    false
  );
  assert.equal(
    serviceInternals.matchesAutoSyncWindow(
      {
        ...baseDeclaration,
        createdAt: '2026-04-25T00:00:00.000Z'
      },
      from
    ),
    false
  );
});

test('syncDeclaration upserts a CustomsDeclaration and records idempotent TripEvents only in GateSync', async () => {
  const fixture = loadFixture();
  const sessionStore = new CuaKhauSoSessionStore();
  sessionStore.save('00000000-0000-4000-8000-000000000001', requestUser.id, {
    accessToken: 'source-token',
    refreshCookies: [],
    username: 'source-user'
  });
  let declarationUpsertArgs: Record<string, unknown> | undefined;
  let tripUpdateArgs: Record<string, unknown> | undefined;
  const eventCalls: Array<{ payload: Record<string, unknown>; idempotencyKey?: string }> = [];
  const tx = {
    customsDeclaration: {
      upsert: async (args: Record<string, unknown>) => {
        declarationUpsertArgs = args;
        return {
          id: '00000000-0000-4000-8000-000000000013',
          declarationNumber: '2026050300533'
        };
      }
    },
    trip: {
      findFirst: async () => ({
        id: '00000000-0000-4000-8000-000000000020',
        tripCode: 'GS-IMPORT-001',
        customsDeclarationId: null,
        vehicleId: null,
        driverProfileId: null
      }),
      update: async (args: Record<string, unknown>) => {
        tripUpdateArgs = args;
        return {
          id: '00000000-0000-4000-8000-000000000020',
          tripCode: 'GS-IMPORT-001',
          customsDeclarationId: '00000000-0000-4000-8000-000000000013',
          vehicleId: null,
          driverProfileId: null
        };
      }
    },
    vehicle: {
      findFirst: async () => null
    },
    integrationAccount: {
      update: async () => ({ id: 'account-1' })
    },
    auditLog: {
      create: async () => ({ id: 'audit-1' })
    }
  };
  const prisma = {
    trip: {
      updateMany: async () => ({
        count: 1
      })
    },
    integrationAccount: {
      upsert: async () => ({
        id: 'account-1'
      })
    },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)
  };
  const client = {
    getDeclarationDetail: async () => ({
      data: fixture
    })
  };
  const tripsService = {
    createEvent: async (
      _user: RequestUser,
      _organizationId: string,
      _tripId: string,
      payload: Record<string, unknown>,
      idempotencyKey?: string
    ) => {
      const eventCall: { payload: Record<string, unknown>; idempotencyKey?: string } = { payload };

      if (idempotencyKey !== undefined) {
        eventCall.idempotencyKey = idempotencyKey;
      }

      eventCalls.push(eventCall);
      return {
        id: `event-${eventCalls.length}`,
        eventType: payload.eventType,
        occurredAt: payload.occurredAt
      };
    }
  };
  const service = createService({ prisma, client, tripsService, sessionStore });

  const result = await service.syncDeclaration(
    requestUser,
    '00000000-0000-4000-8000-000000000001',
    fixture.id,
    {
      tripId: '00000000-0000-4000-8000-000000000020'
    }
  );

  assert.equal(result.declaration.declarationNumber, '2026050300533');
  assert.equal(result.linkedTripId, '00000000-0000-4000-8000-000000000020');
  assert.equal(declarationUpsertArgs !== undefined, true);
  assert.equal(tripUpdateArgs !== undefined, true);
  assert.equal(eventCalls.length > 0, true);
  assert.equal(
    eventCalls.every((call) => call.payload.source === 'CUA_KHAU_SO'),
    true
  );
  assert.equal(
    eventCalls.every((call) =>
      call.idempotencyKey?.includes('00000000-0000-4000-8000-000000000001')
    ),
    true
  );
});

test('syncDeclaration creates a GateSync Trip when no matching trip exists', async () => {
  const fixture = loadFixture();
  const sessionStore = new CuaKhauSoSessionStore();
  sessionStore.save('00000000-0000-4000-8000-000000000001', requestUser.id, {
    accessToken: 'source-token',
    refreshCookies: [],
    username: 'source-user'
  });
  let tripCreateData: Record<string, unknown> | undefined;
  const createdParticipants: Record<string, unknown>[] = [];
  const createdTripEvents: Record<string, unknown>[] = [];
  const createdAuditActions: string[] = [];
  const eventCalls: Array<{
    tripId: string;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
  }> = [];
  const tx = {
    customsDeclaration: {
      upsert: async () => ({
        id: '00000000-0000-4000-8000-000000000013',
        declarationNumber: '2026050300533'
      })
    },
    trip: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        tripCreateData = data;
        return {
          id: '00000000-0000-4000-8000-000000000021',
          tripCode: data.tripCode,
          customsDeclarationId: data.customsDeclarationId,
          vehicleId: null,
          driverProfileId: null
        };
      },
      update: async () => undefined
    },
    vehicle: {
      findFirst: async () => null
    },
    tripParticipant: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdParticipants.push(data);
        return data;
      }
    },
    tripEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdTripEvents.push(data);
        return data;
      }
    },
    integrationAccount: {
      update: async () => ({ id: 'account-1' })
    },
    auditLog: {
      create: async ({ data }: { data: { action: string } }) => {
        createdAuditActions.push(data.action);
        return data;
      }
    }
  };
  const prisma = {
    trip: {
      updateMany: async () => ({
        count: 1
      })
    },
    integrationAccount: {
      upsert: async () => ({
        id: 'account-1'
      })
    },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)
  };
  const client = {
    getDeclarationDetail: async () => ({
      data: fixture
    })
  };
  const tripsService = {
    createEvent: async (
      _user: RequestUser,
      _organizationId: string,
      tripId: string,
      payload: Record<string, unknown>,
      idempotencyKey?: string
    ) => {
      const eventCall: {
        tripId: string;
        payload: Record<string, unknown>;
        idempotencyKey?: string;
      } = { tripId, payload };

      if (idempotencyKey !== undefined) {
        eventCall.idempotencyKey = idempotencyKey;
      }

      eventCalls.push(eventCall);
      return {
        id: `event-${eventCalls.length}`,
        eventType: payload.eventType,
        occurredAt: payload.occurredAt
      };
    }
  };
  const service = createService({ prisma, client, tripsService, sessionStore });

  const result = await service.syncDeclaration(
    requestUser,
    '00000000-0000-4000-8000-000000000001',
    fixture.id,
    {}
  );

  assert.equal(result.linkedBy, 'created');
  assert.equal(result.linkedTripId, '00000000-0000-4000-8000-000000000021');
  assert.equal(tripCreateData?.tripCode, '2026050300533');
  assert.equal(tripCreateData?.tripType, 'IMPORT_WITH_GOODS');
  assert.equal(tripCreateData?.direction, 'IMPORT');
  assert.equal(tripCreateData?.customsDeclarationId, '00000000-0000-4000-8000-000000000013');
  assert.equal(createdParticipants[0]?.role, 'OWNER_ORG');
  assert.equal(createdTripEvents[0]?.eventType, 'TRIP_CREATED');
  assert.equal(createdAuditActions.includes('integration.cua_khau_so.create_trip'), true);
  assert.equal(createdAuditActions.includes('integration.cua_khau_so.sync_declaration'), true);
  assert.equal(eventCalls.length > 0, true);
  assert.equal(
    eventCalls.every((call) => call.tripId === '00000000-0000-4000-8000-000000000021'),
    true
  );
});
