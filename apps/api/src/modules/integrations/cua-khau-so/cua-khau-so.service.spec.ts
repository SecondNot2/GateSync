import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import type { RequestUser } from '../../auth/request-user';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TripsService } from '../../trips/trips.service';
import { CuaKhauSoMapper } from './cua-khau-so.mapper';
import { CuaKhauSoService } from './cua-khau-so.service';
import { CuaKhauSoSessionStore } from './cua-khau-so-session.store';
import type { CuaKhauSoClient } from './cua-khau-so.client';
import type { CuaKhauSoDeclarationDetail } from './cua-khau-so.types';

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
    readFileSync(path.resolve(process.cwd(), '../../handoff/fixtures/raw-json.json'), 'utf8')
  ) as { data: CuaKhauSoDeclarationDetail };

  return raw.data;
}

function createService(params: {
  prisma: unknown;
  client: unknown;
  tripsService?: unknown;
  sessionStore?: CuaKhauSoSessionStore;
}) {
  return new CuaKhauSoService(
    params.prisma as PrismaService,
    params.client as CuaKhauSoClient,
    new CuaKhauSoMapper(),
    params.sessionStore ?? new CuaKhauSoSessionStore(),
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

test('listDeclarations requires a server-side source session', async () => {
  const service = createService({
    prisma: {},
    client: {}
  });

  await assert.rejects(
    async () =>
      service.listDeclarations(requestUser, '00000000-0000-4000-8000-000000000001', {
        toExternalParams: () => ({
          pageNumber: 1,
          pageSize: 20
        })
      } as never),
    UnauthorizedException
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
        customsDeclarationId: null
      }),
      update: async (args: Record<string, unknown>) => {
        tripUpdateArgs = args;
        return args;
      }
    },
    integrationAccount: {
      update: async () => ({ id: 'account-1' })
    },
    auditLog: {
      create: async () => ({ id: 'audit-1' })
    }
  };
  const prisma = {
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
