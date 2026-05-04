import assert from 'node:assert/strict';
import test from 'node:test';
import { PermissionsService } from './permissions.service';
import type { RequestMembership } from './request-user';

const service = new PermissionsService();

test('owner and admin can manage organization memberships', () => {
  assert.equal(service.can('OWNER', 'memberships:manage'), true);
  assert.equal(service.can('ADMIN', 'memberships:manage'), true);
});

test('viewer cannot manage organization memberships or trips', () => {
  assert.equal(service.can('VIEWER', 'memberships:manage'), false);
  assert.equal(service.can('VIEWER', 'trips:manage'), false);
  assert.equal(service.can('VIEWER', 'trips:read'), true);
});

test('dispatcher can manage trips and fleet but not members', () => {
  assert.equal(service.can('DISPATCHER', 'trips:manage'), true);
  assert.equal(service.can('DISPATCHER', 'fleet:manage'), true);
  assert.equal(service.can('DISPATCHER', 'memberships:manage'), false);
});

test('document staff can use document integrations but not fleet management', () => {
  assert.equal(service.can('DOCUMENT_STAFF', 'integrations:cua-khau-so:read'), true);
  assert.equal(service.can('DOCUMENT_STAFF', 'integrations:cua-khau-so:sync'), true);
  assert.equal(service.can('DOCUMENT_STAFF', 'fleet:manage'), false);
});

test('viewer cannot use Cua Khau So integration sync', () => {
  assert.equal(service.can('VIEWER', 'integrations:cua-khau-so:read'), false);
  assert.equal(service.can('VIEWER', 'integrations:cua-khau-so:sync'), false);
});

test('role checks require active membership', () => {
  const suspendedMembership: RequestMembership = {
    id: 'membership-1',
    organizationId: 'organization-1',
    role: 'OWNER',
    status: 'SUSPENDED'
  };

  assert.equal(service.hasAnyRole(suspendedMembership, ['OWNER']), false);
});
