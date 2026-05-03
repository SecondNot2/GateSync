import { Injectable } from '@nestjs/common';
import type { MembershipRole } from '@prisma/client';
import type { RequestMembership } from './request-user';

export type OrganizationPermission =
  | 'organizations:read'
  | 'organizations:update'
  | 'memberships:manage'
  | 'fleet:manage'
  | 'trips:manage'
  | 'trips:read'
  | 'billing:manage';

const rolePermissions: Record<MembershipRole, OrganizationPermission[]> = {
  OWNER: [
    'organizations:read',
    'organizations:update',
    'memberships:manage',
    'fleet:manage',
    'trips:manage',
    'trips:read',
    'billing:manage'
  ],
  ADMIN: [
    'organizations:read',
    'organizations:update',
    'memberships:manage',
    'fleet:manage',
    'trips:manage',
    'trips:read'
  ],
  DISPATCHER: ['organizations:read', 'fleet:manage', 'trips:manage', 'trips:read'],
  DOCUMENT_STAFF: ['organizations:read', 'trips:manage', 'trips:read'],
  FIELD_OPERATOR: ['organizations:read', 'trips:manage', 'trips:read'],
  VIEWER: ['organizations:read', 'trips:read'],
  BILLING_ADMIN: ['organizations:read', 'billing:manage']
};

@Injectable()
export class PermissionsService {
  can(role: MembershipRole, permission: OrganizationPermission): boolean {
    return rolePermissions[role]?.includes(permission) ?? false;
  }

  hasActiveMembership(membership: RequestMembership | undefined): membership is RequestMembership {
    return membership?.status === 'ACTIVE';
  }

  hasAnyRole(membership: RequestMembership | undefined, roles: MembershipRole[]): boolean {
    return this.hasActiveMembership(membership) && roles.includes(membership.role);
  }
}
