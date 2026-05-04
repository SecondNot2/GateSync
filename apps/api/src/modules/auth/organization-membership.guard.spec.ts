import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { OrganizationMembershipGuard } from './organization-membership.guard';
import type { AuthenticatedRequest } from './request-user';

const guard = new OrganizationMembershipGuard();

function createContext(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request
    })
  } as ExecutionContext;
}

test('allows active members to access their organization', () => {
  const request: Partial<AuthenticatedRequest> = {
    params: {
      organizationId: 'organization-1'
    },
    user: {
      id: 'user-1',
      supabaseUserId: 'supabase-user-1',
      claims: {},
      memberships: [
        {
          id: 'membership-1',
          organizationId: 'organization-1',
          role: 'DISPATCHER',
          status: 'ACTIVE'
        }
      ]
    }
  };

  assert.equal(guard.canActivate(createContext(request)), true);
  assert.equal(request.organizationMembership?.id, 'membership-1');
});

test('blocks cross-tenant organization access', () => {
  const request: Partial<AuthenticatedRequest> = {
    params: {
      organizationId: 'organization-2'
    },
    user: {
      id: 'user-1',
      supabaseUserId: 'supabase-user-1',
      claims: {},
      memberships: [
        {
          id: 'membership-1',
          organizationId: 'organization-1',
          role: 'OWNER',
          status: 'ACTIVE'
        }
      ]
    }
  };

  assert.throws(() => guard.canActivate(createContext(request)), ForbiddenException);
});

test('blocks suspended and removed organization memberships', () => {
  for (const status of ['SUSPENDED', 'REMOVED'] as const) {
    const request: Partial<AuthenticatedRequest> = {
      params: {
        organizationId: 'organization-1'
      },
      user: {
        id: 'user-1',
        supabaseUserId: 'supabase-user-1',
        claims: {},
        memberships: [
          {
            id: `membership-${status}`,
            organizationId: 'organization-1',
            role: 'OWNER',
            status
          }
        ]
      }
    };

    assert.throws(() => guard.canActivate(createContext(request)), ForbiddenException);
  }
});
