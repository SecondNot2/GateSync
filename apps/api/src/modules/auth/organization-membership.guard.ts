import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './request-user';

@Injectable()
export class OrganizationMembershipGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const organizationId = request.params.organizationId;

    if (!organizationId) {
      throw new BadRequestException('Missing organizationId route parameter.');
    }

    const membership = request.user.memberships.find(
      (item) => item.organizationId === organizationId && item.status === 'ACTIVE'
    );

    if (!membership) {
      throw new ForbiddenException('You do not have access to this organization.');
    }

    request.organizationMembership = membership;

    return true;
  }
}
