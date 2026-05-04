import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { OrganizationPermissionsGuard } from './organization-permissions.guard';
import { ORGANIZATION_PERMISSIONS_KEY } from './organization-permissions.decorator';
import { PermissionsService } from './permissions.service';
import type { AuthenticatedRequest } from './request-user';

function createGuard(permissions: string[]) {
  const reflector = {
    getAllAndOverride: (key: string) =>
      key === ORGANIZATION_PERMISSIONS_KEY ? permissions : undefined
  };

  return new OrganizationPermissionsGuard(reflector as never, new PermissionsService());
}

function createContext(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    getClass: () => class TestController {},
    getHandler: () => function testHandler() {},
    switchToHttp: () => ({
      getRequest: () => request
    })
  } as unknown as ExecutionContext;
}

test('allows roles with required organization permissions', () => {
  const guard = createGuard(['integrations:cua-khau-so:sync']);
  const request: Partial<AuthenticatedRequest> = {
    organizationMembership: {
      id: 'membership-1',
      organizationId: 'organization-1',
      role: 'DOCUMENT_STAFF',
      status: 'ACTIVE'
    }
  };

  assert.equal(guard.canActivate(createContext(request)), true);
});

test('blocks roles without required organization permissions', () => {
  const guard = createGuard(['memberships:manage']);
  const request: Partial<AuthenticatedRequest> = {
    organizationMembership: {
      id: 'membership-1',
      organizationId: 'organization-1',
      role: 'VIEWER',
      status: 'ACTIVE'
    }
  };

  assert.throws(() => guard.canActivate(createContext(request)), ForbiddenException);
});

test('blocks inactive memberships even when the role has permission', () => {
  const guard = createGuard(['fleet:manage']);
  const request: Partial<AuthenticatedRequest> = {
    organizationMembership: {
      id: 'membership-1',
      organizationId: 'organization-1',
      role: 'DISPATCHER',
      status: 'SUSPENDED'
    }
  };

  assert.throws(() => guard.canActivate(createContext(request)), ForbiddenException);
});
