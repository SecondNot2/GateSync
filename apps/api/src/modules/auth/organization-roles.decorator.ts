import { SetMetadata } from '@nestjs/common';
import type { MembershipRole } from '@prisma/client';

export const ORGANIZATION_ROLES_KEY = 'organizationRoles';

export const OrganizationRoles = (...roles: MembershipRole[]) =>
  SetMetadata(ORGANIZATION_ROLES_KEY, roles);
