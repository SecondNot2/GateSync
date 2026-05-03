import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { MembershipRole } from '@prisma/client';
import { ORGANIZATION_ROLES_KEY } from './organization-roles.decorator';
import { PermissionsService } from './permissions.service';
import type { AuthenticatedRequest } from './request-user';

@Injectable()
export class OrganizationRolesGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PermissionsService) private readonly permissions: PermissionsService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<MembershipRole[]>(ORGANIZATION_ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!roles || roles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!this.permissions.hasAnyRole(request.organizationMembership, roles)) {
      throw new ForbiddenException('Your role does not allow this organization action.');
    }

    return true;
  }
}
