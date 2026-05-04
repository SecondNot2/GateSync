import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { RequestUser } from '../auth/request-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { UpdateMembershipDto } from './dto/update-membership.dto';
import { MembershipsService } from './memberships.service';

function createService(prisma: unknown): MembershipsService {
  return new MembershipsService(prisma as PrismaService);
}

const adminUser: RequestUser = {
  id: 'admin-user',
  supabaseUserId: 'admin-supabase-user',
  claims: {},
  memberships: [
    {
      id: 'admin-membership',
      organizationId: 'org-1',
      role: 'ADMIN',
      status: 'ACTIVE'
    }
  ]
};

const ownerUser: RequestUser = {
  id: 'owner-user',
  supabaseUserId: 'owner-supabase-user',
  claims: {},
  memberships: [
    {
      id: 'owner-membership',
      organizationId: 'org-1',
      role: 'OWNER',
      status: 'ACTIVE'
    }
  ]
};

test('listMemberships only reads active records from the organization scope', async () => {
  let findArgs: { where?: Record<string, unknown> } | undefined;
  const prisma = {
    membership: {
      findMany: async (args: { where?: Record<string, unknown> }) => {
        findArgs = args;
        return [];
      }
    }
  };
  const service = createService(prisma);

  await service.listMemberships('org-1');

  assert.deepEqual(findArgs?.where, {
    organizationId: 'org-1',
    deletedAt: null
  });
});

test('updateMembership rejects cross-tenant membership update', async () => {
  const prisma = {
    membership: {
      findFirst: async () => null
    }
  };
  const service = createService(prisma);
  const dto: UpdateMembershipDto = {
    role: 'DISPATCHER'
  };

  await assert.rejects(
    async () => service.updateMembership(adminUser, 'org-1', 'membership-from-other-org', dto),
    NotFoundException
  );
});

test('admin cannot update owner memberships', async () => {
  const prisma = {
    membership: {
      findFirst: async () => ({
        id: 'owner-membership',
        organizationId: 'org-1',
        userId: 'owner-user',
        role: 'OWNER',
        status: 'ACTIVE'
      })
    }
  };
  const service = createService(prisma);
  const dto: UpdateMembershipDto = {
    status: 'SUSPENDED'
  };

  await assert.rejects(
    async () => service.updateMembership(adminUser, 'org-1', 'owner-membership', dto),
    ForbiddenException
  );
});

test('owner updateMembership writes role and audit log', async () => {
  let updateData: Record<string, unknown> | undefined;
  let auditData: Record<string, unknown> | undefined;
  const existingMembership = {
    id: 'member-1',
    organizationId: 'org-1',
    userId: 'member-user',
    role: 'VIEWER',
    status: 'ACTIVE'
  };
  const tx = {
    membership: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updateData = data;
        return {
          ...existingMembership,
          role: data.role ?? existingMembership.role,
          status: data.status ?? existingMembership.status
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
  const prisma = {
    membership: {
      findFirst: async () => existingMembership,
      count: async () => 1
    },
    $transaction: async (callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)
  };
  const service = createService(prisma);
  const dto: UpdateMembershipDto = {
    role: 'DISPATCHER'
  };

  const membership = await service.updateMembership(ownerUser, 'org-1', 'member-1', dto);

  assert.equal(membership.role, 'DISPATCHER');
  assert.equal(updateData?.role, 'DISPATCHER');
  assert.equal(auditData?.action, 'membership.update');
  assert.equal(auditData?.organizationId, 'org-1');
});

test('updateMembership requires at least one field', async () => {
  const service = createService({});

  await assert.rejects(
    async () => service.updateMembership(ownerUser, 'org-1', 'member-1', {}),
    BadRequestException
  );
});
