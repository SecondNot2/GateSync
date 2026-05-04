import { SetMetadata } from '@nestjs/common';
import type { OrganizationPermission } from '@gatesync/shared';

export const ORGANIZATION_PERMISSIONS_KEY = 'organizationPermissions';

export const OrganizationPermissions = (...permissions: OrganizationPermission[]) =>
  SetMetadata(ORGANIZATION_PERMISSIONS_KEY, permissions);
