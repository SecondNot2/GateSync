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

test('createInvitation creates a one-time invite code and audit log', async () => {
  let createdInvitationData: Record<string, unknown> | undefined;
  let auditData: Record<string, unknown> | undefined;
  const tx = {
    membershipInvitation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdInvitationData = data;
        return {
          id: 'invitation-1',
          organizationId: data.organizationId,
          email: data.email,
          role: data.role,
          status: 'PENDING',
          expiresAt: data.expiresAt as Date,
          createdAt: new Date('2026-05-05T00:00:00.000Z'),
          acceptedAt: null
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
    user: {
      findUnique: async () => null
    },
    $transaction: async (callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)
  };
  const service = createService(prisma);

  const invitation = await service.createInvitation(ownerUser, 'org-1', {
    email: '  Dispatcher@GateSync.Local ',
    role: 'DISPATCHER'
  });

  assert.equal(invitation.email, 'dispatcher@gatesync.local');
  assert.equal(invitation.status, 'PENDING');
  assert.match(invitation.inviteCode, /^GS-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
  assert.equal(createdInvitationData?.email, 'dispatcher@gatesync.local');
  assert.notEqual(createdInvitationData?.codeHash, invitation.inviteCode);
  assert.equal(auditData?.action, 'membership.invitation.create');
});

test('createInvitation rejects inviting an active member again', async () => {
  const prisma = {
    user: {
      findUnique: async () => ({
        memberships: [
          {
            status: 'ACTIVE'
          }
        ]
      })
    }
  };
  const service = createService(prisma);

  await assert.rejects(
    async () =>
      service.createInvitation(ownerUser, 'org-1', {
        email: 'active@gatesync.local',
        role: 'VIEWER'
      }),
    BadRequestException
  );
});

test('createInvitation rejects active members without membership management rights', async () => {
  const dispatcherUser: RequestUser = {
    id: 'dispatcher-user',
    supabaseUserId: 'dispatcher-supabase-user',
    claims: {},
    memberships: [
      {
        id: 'dispatcher-membership',
        organizationId: 'org-1',
        role: 'DISPATCHER',
        status: 'ACTIVE'
      }
    ]
  };
  const service = createService({});

  await assert.rejects(
    async () =>
      service.createInvitation(dispatcherUser, 'org-1', {
        email: 'viewer@gatesync.local',
        role: 'VIEWER'
      }),
    ForbiddenException
  );
});

test('acceptInvitation activates the invited user membership and audit log', async () => {
  let codeHash: unknown;
  let membershipCreateData: Record<string, unknown> | undefined;
  let invitationUpdateData: Record<string, unknown> | undefined;
  let acceptAuditData: Record<string, unknown> | undefined;
  const invitationRecord = {
    id: 'invitation-1',
    organizationId: 'org-1',
    email: 'invitee@gatesync.local',
    role: 'DISPATCHER',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date('2026-05-05T00:00:00.000Z'),
    acceptedAt: null
  };
  const tx = {
    membershipInvitation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        codeHash = data.codeHash;
        return invitationRecord;
      },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        invitationUpdateData = data;
        return {
          count: 1
        };
      }
    },
    membership: {
      findUnique: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        membershipCreateData = data;
        return {
          id: 'membership-1',
          ...data,
          deletedAt: null
        };
      }
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        acceptAuditData = data;
        return data;
      }
    }
  };
  const prisma = {
    user: {
      findUnique: async () => null
    },
    membershipInvitation: {
      findUnique: async ({ where }: { where: { codeHash: string } }) =>
        where.codeHash === codeHash
          ? {
              ...invitationRecord,
              codeHash
            }
          : null
    },
    $transaction: async (callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)
  };
  const service = createService(prisma);
  const invitation = await service.createInvitation(ownerUser, 'org-1', {
    email: 'invitee@gatesync.local',
    role: 'DISPATCHER'
  });
  const invitedUser: RequestUser = {
    id: 'invitee-user',
    supabaseUserId: 'invitee-supabase-user',
    email: 'invitee@gatesync.local',
    claims: {},
    memberships: []
  };

  const membership = await service.acceptInvitation(invitedUser, {
    code: invitation.inviteCode
  });

  assert.equal(membership.role, 'DISPATCHER');
  assert.equal(membershipCreateData?.organizationId, 'org-1');
  assert.equal(membershipCreateData?.userId, 'invitee-user');
  assert.equal(invitationUpdateData?.status, 'ACCEPTED');
  assert.equal(acceptAuditData?.action, 'membership.invitation.accept');
});

test('acceptInvitation rejects a code assigned to a different email', async () => {
  const prisma = {
    membershipInvitation: {
      findUnique: async () => ({
        id: 'invitation-1',
        organizationId: 'org-1',
        email: 'other@gatesync.local',
        role: 'VIEWER',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date('2026-05-05T00:00:00.000Z'),
        acceptedAt: null,
        codeHash: 'hash'
      })
    }
  };
  const service = createService(prisma);
  const invitedUser: RequestUser = {
    id: 'invitee-user',
    supabaseUserId: 'invitee-supabase-user',
    email: 'invitee@gatesync.local',
    claims: {},
    memberships: []
  };

  await assert.rejects(
    async () =>
      service.acceptInvitation(invitedUser, {
        code: 'GS-1111-2222-3333'
      }),
    ForbiddenException
  );
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
