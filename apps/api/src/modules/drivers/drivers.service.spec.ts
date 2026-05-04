import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RequestUser } from '../auth/request-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { CreateDriverDto } from './dto/create-driver.dto';
import { DriversService } from './drivers.service';

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

function createService(prisma: unknown): DriversService {
  return new DriversService(prisma as PrismaService);
}

test('listDrivers only queries drivers inside the organization', async () => {
  let findArgs: { where?: Record<string, unknown> } | undefined;
  const prisma = {
    driverProfile: {
      findMany: async (args: { where?: Record<string, unknown> }) => {
        findArgs = args;
        return [];
      }
    }
  };
  const service = createService(prisma);

  await service.listDrivers('org-1');

  assert.deepEqual(findArgs?.where, {
    organizationId: 'org-1',
    deletedAt: null
  });
});

test('createDriver checks linked user is an active member before writing', async () => {
  let membershipFindWhere: Record<string, unknown> | undefined;
  let transactionCalled = false;
  const prisma = {
    membership: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        membershipFindWhere = where;
        return null;
      }
    },
    $transaction: async () => {
      transactionCalled = true;
      return undefined;
    }
  };
  const service = createService(prisma);
  const dto: CreateDriverDto = {
    displayName: 'Nguyễn Văn Bình',
    userId: 'user-2'
  };

  await assert.rejects(async () => service.createDriver(requestUser, 'org-1', dto), BadRequestException);
  assert.deepEqual(membershipFindWhere, {
    organizationId: 'org-1',
    userId: 'user-2',
    status: 'ACTIVE',
    deletedAt: null
  });
  assert.equal(transactionCalled, false);
});

test('createDriver rejects user already linked to another driver profile', async () => {
  const tx = {
    driverProfile: {
      create: async () => {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: {
            target: ['userId']
          }
        });
      }
    },
    auditLog: {
      create: async () => undefined
    }
  };
  const prisma = {
    membership: {
      findFirst: async () => ({ id: 'membership-2' })
    },
    $transaction: async (callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)
  };
  const service = createService(prisma);
  const dto: CreateDriverDto = {
    displayName: 'Nguyễn Văn Bình',
    userId: 'user-2'
  };

  await assert.rejects(async () => service.createDriver(requestUser, 'org-1', dto), ConflictException);
});
