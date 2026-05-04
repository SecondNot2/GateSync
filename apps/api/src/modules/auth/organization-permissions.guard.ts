import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { OrganizationPermission } from '@gatesync/shared';
import { ORGANIZATION_PERMISSIONS_KEY } from './organization-permissions.decorator';
import { PermissionsService } from './permissions.service';
import type { AuthenticatedRequest } from './request-user';

@Injectable()
export class OrganizationPermissionsGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PermissionsService) private readonly permissions: PermissionsService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<OrganizationPermission[]>(
      ORGANIZATION_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!this.permissions.hasAllPermissions(request.organizationMembership, requiredPermissions)) {
      throw new ForbiddenException('Your role does not allow this organization action.');
    }

    return true;
  }
}
