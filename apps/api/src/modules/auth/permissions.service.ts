import { Injectable } from '@nestjs/common';
import type { OrganizationPermission } from '@gatesync/shared';
import type { MembershipRole } from '@prisma/client';
import type { RequestMembership } from './request-user';

const rolePermissions = {
  OWNER: [
    'organizations:read',
    'organizations:update',
    'memberships:manage',
    'fleet:manage',
    'trips:read',
    'trips:manage',
    'integrations:cua-khau-so:read',
    'integrations:cua-khau-so:sync',
    'integrations:cua-khau-so:connect',
    'billing:manage'
  ],
  ADMIN: [
    'organizations:read',
    'organizations:update',
    'memberships:manage',
    'fleet:manage',
    'trips:read',
    'trips:manage',
    'integrations:cua-khau-so:read',
    'integrations:cua-khau-so:sync',
    'integrations:cua-khau-so:connect'
  ],
  DISPATCHER: [
    'organizations:read',
    'fleet:manage',
    'trips:read',
    'trips:manage',
    'integrations:cua-khau-so:read',
    'integrations:cua-khau-so:sync',
    'integrations:cua-khau-so:connect'
  ],
  DOCUMENT_STAFF: [
    'organizations:read',
    'trips:read',
    'trips:manage',
    'integrations:cua-khau-so:read',
    'integrations:cua-khau-so:sync',
    'integrations:cua-khau-so:connect'
  ],
  FIELD_OPERATOR: ['organizations:read', 'trips:read', 'trips:manage'],
  VIEWER: ['organizations:read', 'trips:read'],
  BILLING_ADMIN: ['organizations:read', 'billing:manage']
} satisfies Record<MembershipRole, OrganizationPermission[]>;

@Injectable()
export class PermissionsService {
  can(role: MembershipRole, permission: OrganizationPermission): boolean {
    return rolePermissions[role].some((item) => item === permission);
  }

  hasActiveMembership(membership: RequestMembership | undefined): membership is RequestMembership {
    return membership?.status === 'ACTIVE';
  }

  hasAnyRole(membership: RequestMembership | undefined, roles: MembershipRole[]): boolean {
    return this.hasActiveMembership(membership) && roles.includes(membership.role);
  }
}
